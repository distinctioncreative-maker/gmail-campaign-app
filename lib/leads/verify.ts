/**
 * Address verification at import.
 *
 * Import validated syntax and nothing else, which meant a list could contain
 * dead domains, typos, and role inboxes and none of it was visible until the
 * bounces arrived. The bounce brake in lib/campaigns/bounceGuard.ts is the
 * reactive half of this problem: it stops a campaign after 5% of it has
 * already bounced. This is the preventive half, and it is cheaper, because an
 * address never sent to cannot damage a reputation.
 *
 * Everything here except the MX lookup is pure and offline. No paid
 * verification API, no address is ever transmitted anywhere.
 *
 * What this deliberately does not do is open an SMTP connection to ask whether a
 * mailbox exists. That is the only way to detect a catch-all domain or to confirm
 * an individual address, and it is unavailable twice over: Cloud Run blocks
 * outbound port 25, and probing is how sending IPs get blocklisted. The
 * consequence is honest rather than hidden, in the shape of the `UNCONFIRMABLE`
 * verdict below and the provider findings that explain it.
 */
import {
  acceptsEveryAddress,
  describeProvider,
  mailProviderFor,
} from "@/lib/leads/domainProfile";

/**
 * What we are willing to say about an address before anything is sent.
 *
 * `UNCONFIRMABLE` is the honest tier, and adding it corrected an overclaim. An
 * address behind a forwarding service cannot be confirmed by us or by anyone
 * else without sending to it, because the service accepts every address by
 * design. Reporting that as "Verified", which is what happened before, promised
 * something no check performed could support. It is not a warning: it means we
 * found nothing wrong and cannot find anything right either.
 */
export type EmailVerdict = "DELIVERABLE" | "UNCONFIRMABLE" | "RISKY" | "UNDELIVERABLE";

export interface VerificationFinding {
  code:
    | "SYNTAX"
    | "NO_MX"
    | "DISPOSABLE"
    | "ROLE_ADDRESS"
    | "LIKELY_TYPO"
    | "TOO_LONG"
    | "CATCH_ALL"
    | "CONSUMER_MAILBOX"
    | "SECURITY_GATEWAY";
  /** Shown to the person importing, so it has to be worth reading. */
  detail: string;
  /** A corrected address, when we are confident enough to offer one. */
  suggestion?: string;
}

export interface VerificationResult {
  verdict: EmailVerdict;
  findings: VerificationFinding[];
}

/**
 * Mailbox names that belong to a function rather than a person.
 *
 * Not blocked, flagged. Cold mail to these reliably underperforms and draws
 * complaints, but plenty of small businesses genuinely run on info@, and
 * silently dropping a customer's leads would be worse than warning them.
 */
const ROLE_LOCAL_PARTS = new Set([
  "abuse", "admin", "administrator", "billing", "compliance", "contact",
  "info", "hello", "help", "hr", "jobs", "legal", "mail", "marketing",
  "no-reply", "noreply", "office", "postmaster", "privacy", "sales",
  "security", "support", "team", "webmaster",
]);

/** Throwaway providers. A lead here was never a real prospect. */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "maildrop.cc", "fakeinbox.com",
  "dispostable.com", "mailnesia.com", "spamgourmet.com",
]);

/** The domains people actually mistype, for the suggestion check. */
const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "protonmail.com",
  "proton.me", "msn.com", "comcast.net", "verizon.net", "att.net",
];

/** RFC 5321 caps the whole address at 254 octets. */
const MAX_EMAIL_LENGTH = 254;

function editDistance(a: string, b: string): number {
  // Classic Levenshtein, two rows. Inputs are domain names, so length is tiny
  // and the allocation cost of anything cleverer would exceed the saving.
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/**
 * The closest common domain within one or two edits, or null.
 *
 * One edit for short domains and two for longer ones: "gmial.com" is one
 * transposition from "gmail.com", but a fixed threshold of two would turn
 * "att.net" into a suggestion for half the three-letter domains in existence.
 */
export function suggestDomain(domain: string): string | null {
  const lower = domain.toLowerCase();
  if (COMMON_DOMAINS.includes(lower)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(lower, candidate);
    const allowed = candidate.length <= 8 ? 1 : 2;
    if (distance <= allowed && (best === null || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best?.domain ?? null;
}

export function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at).toLowerCase(), domain: email.slice(at + 1).toLowerCase() };
}

export function isRoleAddress(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) return false;
  // Strip a plus tag so "sales+q3@" still reads as a role address.
  const base = parts.local.split("+")[0]!;
  return ROLE_LOCAL_PARTS.has(base);
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Everything that can be decided without touching the network.
 *
 * `hasMx` is passed in rather than looked up here so this stays pure and the
 * caller controls how many DNS queries a big import performs.
 */
export function verifyEmailOffline(
  email: string,
  options: {
    hasMx?: boolean | null;
    /** Exchanger hostnames from the same lookup, when available. Absent simply
     * means the provider checks are skipped. */
    mxHosts?: readonly string[];
    isValidSyntax: boolean;
  } = { isValidSyntax: true }
): VerificationResult {
  const findings: VerificationFinding[] = [];
  const trimmed = email.trim();

  if (!options.isValidSyntax) {
    return {
      verdict: "UNDELIVERABLE",
      findings: [{ code: "SYNTAX", detail: "Not a valid email address." }],
    };
  }
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return {
      verdict: "UNDELIVERABLE",
      findings: [
        { code: "TOO_LONG", detail: `Longer than the ${MAX_EMAIL_LENGTH} character limit for an address.` },
      ],
    };
  }

  const parts = splitEmail(trimmed);
  if (!parts) {
    return {
      verdict: "UNDELIVERABLE",
      findings: [{ code: "SYNTAX", detail: "Not a valid email address." }],
    };
  }

  if (isDisposableDomain(parts.domain)) {
    findings.push({
      code: "DISPOSABLE",
      detail: `${parts.domain} is a throwaway address provider.`,
    });
    return { verdict: "UNDELIVERABLE", findings };
  }

  // An explicit false means the lookup ran and found nothing. Null means it
  // was not attempted, which must never be treated as a failure.
  if (options.hasMx === false) {
    findings.push({
      code: "NO_MX",
      detail: `${parts.domain} has no mail server, so nothing sent there can be delivered.`,
    });
    const suggestion = suggestDomain(parts.domain);
    if (suggestion) {
      findings.push({
        code: "LIKELY_TYPO",
        detail: `Did you mean ${suggestion}?`,
        suggestion: `${parts.local}@${suggestion}`,
      });
    }
    return { verdict: "UNDELIVERABLE", findings };
  }

  const suggestion = suggestDomain(parts.domain);
  if (suggestion) {
    findings.push({
      code: "LIKELY_TYPO",
      detail: `${parts.domain} looks like a misspelling of ${suggestion}.`,
      suggestion: `${parts.local}@${suggestion}`,
    });
  }
  if (isRoleAddress(trimmed)) {
    findings.push({
      code: "ROLE_ADDRESS",
      detail: "A shared inbox rather than a person. These reply rarely and complain often.",
    });
  }

  // Provider checks. These describe the domain rather than the address, so they
  // never make something undeliverable: at most they say what cannot be known.
  const provider = mailProviderFor(parts.domain, options.mxHosts ?? []);
  let unconfirmable = false;

  if (acceptsEveryAddress(provider)) {
    unconfirmable = true;
    findings.push({
      code: "CATCH_ALL",
      detail: `${parts.domain} uses ${describeProvider(provider)}, which accepts mail for every address. Nothing can confirm this mailbox exists short of sending to it, so expect some of these to bounce.`,
    });
  } else if (provider === "CONSUMER") {
    findings.push({
      code: "CONSUMER_MAILBOX",
      detail: `A personal ${parts.domain} address rather than a work one. Fine to keep, but on a business list these tend to be the wrong contact and they complain more than they bounce.`,
    });
  } else if (provider === "SECURITY_GATEWAY") {
    findings.push({
      code: "SECURITY_GATEWAY",
      detail: `${parts.domain} filters inbound mail through ${describeProvider(provider)}. Mail here is more likely to be dropped quietly than bounced, so a missing reply is not proof it arrived.`,
    });
  }

  // A concerning finding outranks an unconfirmable domain: "we found a problem"
  // is more actionable than "we could not check", and a role address at a
  // forwarding domain is still first and foremost a role address.
  const concerning = findings.some((finding) => finding.code !== "CATCH_ALL");
  if (concerning) return { verdict: "RISKY", findings };
  if (unconfirmable) return { verdict: "UNCONFIRMABLE", findings };
  return { verdict: "DELIVERABLE", findings };
}

/** One-line summary for a list of results, for the import preview header. */
export function summarize(results: VerificationResult[]): {
  deliverable: number;
  unconfirmable: number;
  risky: number;
  undeliverable: number;
} {
  return {
    deliverable: results.filter((r) => r.verdict === "DELIVERABLE").length,
    unconfirmable: results.filter((r) => r.verdict === "UNCONFIRMABLE").length,
    risky: results.filter((r) => r.verdict === "RISKY").length,
    undeliverable: results.filter((r) => r.verdict === "UNDELIVERABLE").length,
  };
}

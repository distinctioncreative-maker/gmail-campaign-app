/**
 * Per-workspace tracking domains.
 *
 * Every tracked pixel and rewritten link used one hostname, `APP_BASE_URL`,
 * shared by every customer on the platform. One customer sending genuine spam
 * gets that hostname flagged, and from that moment every other customer's mail
 * contains a flagged domain. Defaulting tracking off shrank how much mail is
 * exposed; it did not remove the exposure, and multi-inbox rotation just raised
 * the volume flowing through it.
 *
 * A customer now points a subdomain of their own at us, verifies it, and their
 * links carry their own hostname and spend their own reputation.
 *
 * This module is pure, and two of the functions in it are a security boundary
 * rather than a convenience:
 *
 * - **`normalizeTrackingDomain`** is the only thing standing between a
 *   customer-supplied string and a hostname interpolated into a URL that goes
 *   into real email. A value carrying a slash, a colon, an @, or a newline
 *   could otherwise redirect the link somewhere else entirely or split the
 *   header it sits in.
 * - **`hostBelongsToOrganization`** cross-checks the `Host` a tracking request
 *   arrived on against the organization its signed token names. Routing never
 *   needs this, because the token is self-describing; the check exists so one
 *   customer's tracking hostname cannot be used to serve another customer's
 *   links, which would leak "this recipient opened" across a tenant boundary.
 */

export type DomainStatus = "NONE" | "PENDING" | "VERIFIED" | "FAILED";

/** What a customer must create at their DNS provider. */
export interface DnsInstruction {
  type: "CNAME";
  name: string;
  value: string;
  ttl: string;
}

export interface NormalizedDomain {
  ok: boolean;
  /** Lowercased, trimmed, punycode-safe hostname. Empty when not ok. */
  host: string;
  reason: string;
}

/**
 * A label is 1 to 63 characters of letters, digits, and inner hyphens. This is
 * deliberately stricter than the RFCs allow: underscores and trailing dots are
 * legal in DNS and have no business in a hostname we put in a URL.
 */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Hosts nobody may claim, because claiming one would hijack our own surface. */
const RESERVED_SUFFIXES = ["localhost", "local", "internal", "example", "invalid", "test"];

export function normalizeTrackingDomain(raw: string): NormalizedDomain {
  const fail = (reason: string): NormalizedDomain => ({ ok: false, host: "", reason });
  let value = String(raw ?? "").trim().toLowerCase();

  if (!value) return fail("Enter a subdomain, for example track.yourcompany.com.");

  // Strip a scheme and anything after the host. People paste URLs, and the
  // helpful thing is to accept one rather than reject it on a technicality.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0].split("?")[0].split("#")[0];
  // A trailing dot is a legal absolute FQDN and is not wanted in a URL.
  value = value.replace(/\.$/, "");

  // Anything left that is not a hostname is a refusal, not something to clean
  // up further. Silently rewriting a value the customer did not type is how a
  // link ends up pointing at a host they never approved.
  if (/[@\s:\\]/.test(value)) {
    return fail("That does not look like a hostname. Use just the subdomain, with no @ or port.");
  }
  if (value.length > 253) return fail("That hostname is too long.");

  // Checked before the per-label rules below, so an international domain is
  // told to punycode itself rather than getting a generic "use letters and
  // numbers" complaint it cannot act on. Punycode is fine as ASCII; a raw
  // unicode label is not, because two different-looking strings can normalize
  // to the same host, which is what a homograph attack relies on.
  if (/[^\x20-\x7e]/.test(value)) {
    return fail("Convert an international domain to its punycode (xn--) form first.");
  }

  const labels = value.split(".");
  if (labels.length < 3) {
    // Two labels is the registrable domain itself. Pointing the apex at us
    // would take over their website, so it is refused rather than accepted and
    // regretted.
    return fail("Use a subdomain such as track.yourcompany.com, not your main domain.");
  }
  if (!labels.every((label) => LABEL.test(label))) {
    return fail("Use only letters, numbers, and hyphens in each part of the hostname.");
  }
  if (RESERVED_SUFFIXES.includes(labels[labels.length - 1])) {
    return fail("That is not a public domain. Use a hostname you own on the internet.");
  }

  return { ok: true, host: value, reason: "" };
}

/**
 * The CNAME target a customer points at.
 *
 * Derived from APP_BASE_URL rather than hardcoded, so a staging deployment
 * hands out its own target and nobody verifies a domain against production by
 * accident.
 */
export function cnameTarget(appBaseUrl: string): string {
  try {
    return new URL(appBaseUrl).host;
  } catch {
    return "";
  }
}

export function dnsInstruction(host: string, appBaseUrl: string): DnsInstruction {
  const labels = host.split(".");
  return {
    type: "CNAME",
    // Most DNS interfaces want the subdomain only, not the full name.
    name: labels[0],
    value: cnameTarget(appBaseUrl),
    ttl: "300 (or your provider's default)",
  };
}

export interface VerificationInput {
  /** Hostnames the CNAME chain resolved to, lowercased. */
  cnames: readonly string[];
  /** Null when the lookup itself could not be completed. */
  resolved: boolean;
  expectedTarget: string;
}

export interface VerificationResult {
  verified: boolean;
  status: DomainStatus;
  message: string;
}

/**
 * Whether DNS says the domain points at us.
 *
 * A lookup that could not complete is reported as still pending, never as
 * failed. DNS propagation takes minutes to hours, and telling a customer their
 * correct configuration is broken sends them to change something that was
 * already right.
 */
export function assessVerification(input: VerificationInput): VerificationResult {
  if (!input.resolved) {
    return {
      verified: false,
      status: "PENDING",
      message:
        "No CNAME record found yet. DNS changes can take up to an hour to appear, so this is normal right after you add it.",
    };
  }
  const expected = input.expectedTarget.toLowerCase().replace(/\.$/, "");
  const found = input.cnames.map((c) => c.toLowerCase().replace(/\.$/, ""));
  if (found.some((c) => c === expected)) {
    return { verified: true, status: "VERIFIED", message: "Verified. Tracked links now use your own domain." };
  }
  return {
    verified: false,
    status: "FAILED",
    message: `That hostname points at ${found[0] ?? "somewhere else"} rather than ${expected}. Update the CNAME and check again.`,
  };
}

export interface WorkspaceDomain {
  organizationId: string;
  host: string;
  status: DomainStatus;
}

/**
 * The base URL tracked links should carry.
 *
 * Only a VERIFIED domain is used. An unverified one would put a hostname in
 * real email that does not resolve, which breaks every link in the send and is
 * strictly worse than the shared-domain risk it was meant to avoid.
 *
 * Note what this does *not* do: a domain that later stops verifying does not
 * retroactively change anything. Links in mail already delivered carry the
 * hostname they were built with, so a break is something to warn about, not
 * something a rewrite can fix.
 */
export function trackingBaseUrl(
  domain: Pick<WorkspaceDomain, "host" | "status"> | null,
  appBaseUrl: string
): string {
  if (!domain || domain.status !== "VERIFIED" || !domain.host) return appBaseUrl;
  // Always https. The tracking endpoints are public and a customer's recipients
  // click these; an http link would be downgraded or blocked by mail clients.
  return `https://${domain.host}`;
}

/** The hostname part of a Host header, without port, case, or trailing dot. */
export function normalizeHostHeader(hostHeader: string | null | undefined): string {
  if (!hostHeader) return "";
  return hostHeader.trim().toLowerCase().split(":")[0].replace(/\.$/, "");
}

/**
 * Whether a tracking request arrived on a hostname this organization may use.
 *
 * The signed token already names the organization, so nothing here is needed to
 * route the request. What it prevents is narrower and still worth preventing:
 * one customer's verified tracking hostname being used to serve another
 * customer's tracking links, which would leak the fact that a specific
 * recipient opened a specific email across a tenant boundary.
 *
 * The platform's own host always passes, because that is where every link
 * pointed before this feature and where they still point for any workspace
 * without a verified domain.
 */
export function hostBelongsToOrganization(
  hostHeader: string | null | undefined,
  organizationId: string,
  verified: readonly WorkspaceDomain[],
  appBaseUrl: string
): boolean {
  const host = normalizeHostHeader(hostHeader);
  // No Host at all: nothing to disagree with, and rejecting would break any
  // client that omits it.
  if (!host) return true;
  if (host === normalizeHostHeader(cnameTarget(appBaseUrl))) return true;
  const owner = verified.find((d) => d.status === "VERIFIED" && d.host.toLowerCase() === host);
  // An unrecognised host is not a tenant-boundary problem: it cannot belong to
  // a different customer, because it belongs to no customer. Cloud Run would
  // not have routed it to us in the first place.
  if (!owner) return true;
  return owner.organizationId === organizationId;
}

/** One line for the settings card. */
export function describeDomainStatus(domain: Pick<WorkspaceDomain, "host" | "status"> | null): string {
  if (!domain || domain.status === "NONE" || !domain.host) {
    return "Tracked links use Cadence's shared domain, which every customer shares.";
  }
  if (domain.status === "VERIFIED") {
    return `Tracked links use ${domain.host}, so your links carry your own reputation.`;
  }
  if (domain.status === "FAILED") {
    return `${domain.host} is not pointing at us yet, so links still use the shared domain.`;
  }
  return `${domain.host} is waiting on DNS. Links use the shared domain until it verifies.`;
}

import { z } from "zod";

/**
 * Email-authentication DNS checks (SPF / DKIM / DMARC) for the sending
 * domain. Parsing is pure and unit-tested; the actual DNS lookups live in
 * dnsLookup.ts (server-only). No external services — just DNS.
 */

export const CheckStatusSchema = z.enum(["PASS", "WARN", "FAIL"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export interface DnsCheck {
  id: "spf" | "dkim" | "dmarc";
  label: string;
  status: CheckStatus;
  detail: string;
  fix: string | null;
}

/** Evaluate SPF from the domain's root TXT records. */
export function evaluateSpf(txtRecords: string[]): DnsCheck {
  const spf = txtRecords.find((r) => r.toLowerCase().startsWith("v=spf1"));
  if (!spf) {
    return {
      id: "spf",
      label: "SPF",
      status: "FAIL",
      detail: "No SPF record found on your domain.",
      fix: 'Add a TXT record on your domain: "v=spf1 include:_spf.google.com ~all". Your IT/domain admin can do this in a minute.',
    };
  }
  const lower = spf.toLowerCase();
  const includesGoogle = lower.includes("include:_spf.google.com");
  if (lower.includes("+all")) {
    return {
      id: "spf",
      label: "SPF",
      status: "FAIL",
      detail: "Your SPF record ends in +all, which lets anyone send as your domain — a spam red flag.",
      fix: 'Change the record to end in "~all" (softfail) or "-all" (hard fail).',
    };
  }
  if (!includesGoogle) {
    return {
      id: "spf",
      label: "SPF",
      status: "WARN",
      detail: "An SPF record exists but doesn't include Google's servers, which you send through.",
      fix: 'Add "include:_spf.google.com" to your existing SPF TXT record.',
    };
  }
  return {
    id: "spf",
    label: "SPF",
    status: "PASS",
    detail: "SPF is set up and includes Google's sending servers.",
    fix: null,
  };
}

/** Evaluate DKIM from the google._domainkey selector lookup result. */
export function evaluateDkim(found: boolean, records: string[]): DnsCheck {
  const hasKey = found && records.some((r) => r.toLowerCase().includes("v=dkim1"));
  if (hasKey) {
    return {
      id: "dkim",
      label: "DKIM",
      status: "PASS",
      detail: "DKIM signing is set up for Google Workspace (google selector).",
      fix: null,
    };
  }
  return {
    id: "dkim",
    label: "DKIM",
    status: found ? "WARN" : "WARN",
    detail: found
      ? "A DKIM record exists at the google selector but doesn't look like a valid key."
      : "No DKIM record at the default Google selector. (If your admin chose a custom selector, this can be a false alarm.)",
    fix: "In Google Admin console → Apps → Google Workspace → Gmail → Authenticate email: generate the DKIM key and add the TXT record it gives you, then click 'Start authentication'.",
  };
}

export interface DmarcParse {
  found: boolean;
  policy: "none" | "quarantine" | "reject" | null;
}

export function parseDmarc(txtRecords: string[]): DmarcParse {
  const rec = txtRecords.find((r) => r.toLowerCase().replace(/\s/g, "").startsWith("v=dmarc1"));
  if (!rec) return { found: false, policy: null };
  const m = rec.toLowerCase().match(/\bp\s*=\s*(none|quarantine|reject)/);
  return { found: true, policy: (m?.[1] as DmarcParse["policy"]) ?? null };
}

export function evaluateDmarc(txtRecords: string[]): DnsCheck {
  const { found, policy } = parseDmarc(txtRecords);
  if (!found) {
    return {
      id: "dmarc",
      label: "DMARC",
      status: "FAIL",
      detail: "No DMARC record. Google requires DMARC for bulk senders and rewards it for everyone.",
      fix: 'Add a TXT record at _dmarc.yourdomain: "v=DMARC1; p=none; rua=mailto:postmaster@yourdomain". Start with p=none — it\'s monitoring-only and can\'t break anything.',
    };
  }
  if (policy === "none" || policy === null) {
    return {
      id: "dmarc",
      label: "DMARC",
      status: "PASS",
      detail: `DMARC is set up (policy: ${policy ?? "none"}). That meets Google's minimum requirement.`,
      fix: "Once you're confident, tightening to p=quarantine improves trust further — optional.",
    };
  }
  return {
    id: "dmarc",
    label: "DMARC",
    status: "PASS",
    detail: `DMARC is set up with an enforcing policy (${policy}). Excellent.`,
    fix: null,
  };
}

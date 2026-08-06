import "server-only";
import { resolveDomains } from "@/lib/leads/mx";
import { splitEmail, summarize, verifyEmailOffline, type VerificationResult } from "@/lib/leads/verify";

/**
 * Verify a parsed batch before anything is saved.
 *
 * One DNS query per distinct domain, not per address, so a two thousand row
 * import from a handful of companies is a handful of lookups. Shared by the
 * CSV and Salesforce preview routes so both show the same verdicts.
 */
export async function verifyLeadBatch<T extends { email: string | null; emailValid: boolean }>(
  leads: T[]
): Promise<{
  verified: Array<T & { verification: VerificationResult }>;
  counts: { deliverable: number; risky: number; undeliverable: number };
}> {
  const domains = new Set<string>();
  for (const lead of leads) {
    if (!lead.email || !lead.emailValid) continue;
    const parts = splitEmail(lead.email.trim());
    if (parts) domains.add(parts.domain);
  }

  const mx = await resolveDomains(domains);

  const verified = leads.map((lead) => {
    if (!lead.email) {
      return {
        ...lead,
        verification: {
          verdict: "UNDELIVERABLE" as const,
          findings: [{ code: "SYNTAX" as const, detail: "No email address on this row." }],
        },
      };
    }
    const parts = splitEmail(lead.email.trim());
    // undefined (never looked up) and null (lookup failed) both mean "unknown"
    // to the verifier, which is not the same as "no mail server".
    const hasMx = parts ? (mx.get(parts.domain) ?? null) : null;
    return {
      ...lead,
      verification: verifyEmailOffline(lead.email, {
        hasMx,
        isValidSyntax: lead.emailValid,
      }),
    };
  });

  return { verified, counts: summarize(verified.map((l) => l.verification)) };
}

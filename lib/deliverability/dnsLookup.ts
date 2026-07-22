import "server-only";
import { resolveTxt } from "node:dns/promises";
import { evaluateSpf, evaluateDkim, evaluateDmarc, type DnsCheck } from "./dns";

async function txt(host: string): Promise<{ found: boolean; records: string[] }> {
  try {
    const chunks = await resolveTxt(host);
    return { found: true, records: chunks.map((parts) => parts.join("")) };
  } catch {
    return { found: false, records: [] };
  }
}

/** Run the three email-auth checks against live DNS. Never throws. */
export async function checkDomainAuth(domain: string): Promise<DnsCheck[]> {
  const [root, dkim, dmarc] = await Promise.all([
    txt(domain),
    txt(`google._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
  ]);
  return [
    evaluateSpf(root.records),
    evaluateDkim(dkim.found, dkim.records),
    evaluateDmarc(dmarc.records),
  ];
}

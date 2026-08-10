import "server-only";
import { resolveMx } from "node:dns/promises";

/**
 * MX lookups for import verification.
 *
 * A domain with no MX record cannot receive mail at all, which makes this the
 * single highest-yield check available without a paid verification service:
 * it catches dead companies, typo'd domains, and made-up addresses before a
 * campaign ever touches them.
 *
 * The exchanger hostnames are returned as well as the yes/no, because the same
 * query answers a second question for free: *who* runs the mail for this domain.
 * A forwarding service accepts every address by construction, and a verdict of
 * "verified" on an address behind one is a promise the product cannot keep. See
 * lib/leads/domainProfile.ts.
 *
 * Keyed by domain rather than address, because a two thousand row import from
 * one company is two thousand addresses and one DNS query. Cached in memory
 * for the life of the instance, since MX records change on the order of years
 * and a stale positive costs nothing.
 */

export interface MxLookup {
  /** True, false, or null when the lookup could not be completed. */
  hasMx: boolean | null;
  /** Exchanger hostnames, lowercased. Empty when unknown or absent. */
  hosts: string[];
}

const cache = new Map<string, { result: MxLookup; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;
/** Bound the cache so a hostile import cannot grow it without limit. */
const MAX_ENTRIES = 5_000;
/** DNS can hang. A slow import is bad; a stuck one is worse. */
const TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Look up a domain's mail exchangers.
 *
 * `hasMx` is null when the lookup could not be completed rather than false, so
 * the caller can tell "no mail server" from "we do not know". Treating a
 * timeout as a failed domain would quietly delete good leads.
 */
export async function lookupMx(domain: string): Promise<MxLookup> {
  const key = domain.toLowerCase().trim();
  if (!key || !key.includes(".")) return { hasMx: false, hosts: [] };

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const records = await withTimeout(resolveMx(key), TIMEOUT_MS);
  // Not cached: a failed lookup is about this moment, not about the domain, and
  // caching it would hold a whole import's worth of unknowns for six hours.
  if (records === null) return { hasMx: null, hosts: [] };

  const hosts = records
    .map((r) => String(r.exchange ?? "").toLowerCase().trim())
    .filter((host) => host !== "");
  const result: MxLookup = { hasMx: hosts.length > 0, hosts };
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { result, at: Date.now() });
  return result;
}

/** Whether a domain has any mail exchanger. Kept for callers that only need
 * the boolean. */
export async function domainHasMx(domain: string): Promise<boolean | null> {
  return (await lookupMx(domain)).hasMx;
}

/**
 * Resolve many domains with bounded concurrency.
 *
 * Unbounded Promise.all over a large import would open hundreds of sockets at
 * once and get the resolver to start refusing.
 */
export async function resolveDomains(
  domains: Iterable<string>,
  concurrency = 12
): Promise<Map<string, MxLookup>> {
  const unique = [...new Set([...domains].map((d) => d.toLowerCase().trim()).filter(Boolean))];
  const out = new Map<string, MxLookup>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const domain = unique[cursor++]!;
      out.set(domain, await lookupMx(domain));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Test seam: drop the cache between cases. */
export function clearMxCache(): void {
  cache.clear();
}

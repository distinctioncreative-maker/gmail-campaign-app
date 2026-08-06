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
 * Keyed by domain rather than address, because a two thousand row import from
 * one company is two thousand addresses and one DNS query. Cached in memory
 * for the life of the instance, since MX records change on the order of years
 * and a stale positive costs nothing.
 */

const cache = new Map<string, { hasMx: boolean; at: number }>();
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
 * Whether a domain has any mail exchanger.
 *
 * Returns null when the lookup could not be completed rather than false, so
 * the caller can tell "no mail server" from "we do not know". Treating a
 * timeout as a failed domain would quietly delete good leads.
 */
export async function domainHasMx(domain: string): Promise<boolean | null> {
  const key = domain.toLowerCase().trim();
  if (!key || !key.includes(".")) return false;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.hasMx;

  const records = await withTimeout(resolveMx(key), TIMEOUT_MS);
  if (records === null) return null;

  const hasMx = records.length > 0 && records.some((r) => r.exchange.length > 0);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { hasMx, at: Date.now() });
  return hasMx;
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
): Promise<Map<string, boolean | null>> {
  const unique = [...new Set([...domains].map((d) => d.toLowerCase().trim()).filter(Boolean))];
  const out = new Map<string, boolean | null>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const domain = unique[cursor++]!;
      out.set(domain, await domainHasMx(domain));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Test seam: drop the cache between cases. */
export function clearMxCache(): void {
  cache.clear();
}

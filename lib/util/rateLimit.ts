import "server-only";
import crypto from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";

export interface RateWindow {
  count: number;
  windowStart: number;
}

/**
 * Pure fixed-window rate-limit decision. Kept separate from Firestore so the
 * window arithmetic is unit-testable.
 */
export function applyRateLimit(
  prev: RateWindow | null,
  now: number,
  limit: number,
  windowMs: number
): { allowed: boolean; next: RateWindow } {
  // Start a fresh window when there's no prior state or the old one expired.
  if (!prev || now - prev.windowStart >= windowMs) {
    return { allowed: true, next: { count: 1, windowStart: now } };
  }
  if (prev.count >= limit) {
    return { allowed: false, next: prev };
  }
  return { allowed: true, next: { count: prev.count + 1, windowStart: prev.windowStart } };
}

/**
 * Firestore-backed fixed-window limiter. Returns true when the caller is within
 * the limit (and records the hit), false when it should be rejected. Fails open
 * on a transaction error so a limiter glitch never blocks legitimate use.
 */
export async function enforceRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  options: { failClosed?: boolean } = {}
): Promise<boolean> {
  const ref = firestore().collection("rateLimits").doc(`${bucket}__${key}`);
  try {
    return await firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? (snap.data() as RateWindow) : null;
      const { allowed, next } = applyRateLimit(prev, Date.now(), limit, windowMs);
      if (allowed) {
        tx.set(ref, {
          ...next,
          // Firestore TTL removes one-off public tracking/auth fingerprints
          // after they are no longer useful.
          expiresAt: Timestamp.fromMillis(
            Date.now() + Math.max(windowMs * 2, 24 * 60 * 60 * 1000)
          ),
        });
      }
      return allowed;
    });
  } catch {
    return options.failClosed !== true;
  }
}

/** Stable privacy-preserving request fingerprint. Google external load
 * balancers append `<client-ip>,<forwarding-rule-ip>` after any untrusted
 * caller-supplied values, making the second-to-last entry the verified client
 * hop and the final entry the shared load-balancer address. */
export function requestRateLimitKey(
  req: Pick<Request, "headers">,
  namespace: string
): string {
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const ip =
    chain.length >= 2
      ? chain[chain.length - 2]
      : chain[0] ?? "unknown";
  const agent = req.headers.get("user-agent")?.slice(0, 120) ?? "";
  return crypto
    .createHash("sha256")
    .update(`${namespace}\u001f${ip}\u001f${agent}`)
    .digest("hex")
    .slice(0, 40);
}

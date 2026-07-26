import "server-only";
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
  windowMs: number
): Promise<boolean> {
  const ref = firestore().collection("rateLimits").doc(`${bucket}__${key}`);
  try {
    return await firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? (snap.data() as RateWindow) : null;
      const { allowed, next } = applyRateLimit(prev, Date.now(), limit, windowMs);
      if (allowed) tx.set(ref, next);
      return allowed;
    });
  } catch {
    return true;
  }
}

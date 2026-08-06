import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signing outbound webhooks.
 *
 * The same scheme the Stripe verifier in lib/billing/stripe.ts already checks
 * on the way in, pointed outward. Deliberately identical rather than novel: a
 * customer receiving our webhooks has almost certainly implemented Stripe's
 * verification already, and handing them the same shape means they can reuse
 * it, which makes them far more likely to verify at all.
 *
 * The timestamp is inside the signed material, not beside it. A signature over
 * the body alone is replayable forever: anyone who captures one delivery can
 * resend it indefinitely and every check still passes. Signing
 * `timestamp.body` means a stale delivery fails on age even though its
 * signature is authentic.
 */

/** Header names, fixed so a customer can hardcode them. */
export const SIGNATURE_HEADER = "cadence-signature";
export const TIMESTAMP_HEADER = "cadence-timestamp";
export const EVENT_HEADER = "cadence-event";
export const DELIVERY_HEADER = "cadence-delivery-id";

/** How old a delivery may be and still verify, for the docs and our own tests. */
export const REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

export function generateSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** The exact bytes both sides sign. Documented, because a customer reimplements it. */
export function signedPayload(timestampSeconds: number, body: string): string {
  return `${timestampSeconds}.${body}`;
}

export function signWebhook(secret: string, timestampSeconds: number, body: string): string {
  return createHmac("sha256", secret).update(signedPayload(timestampSeconds, body)).digest("hex");
}

/**
 * Verify a delivery, from the receiving side.
 *
 * Exported so our own tests can prove the thing we document actually validates,
 * and so the docs page can show working code rather than pseudocode.
 */
export function verifyWebhook(input: {
  secret: string;
  signature: string;
  timestampSeconds: number;
  body: string;
  nowMs?: number;
  toleranceMs?: number;
}): { valid: boolean; reason: string } {
  const now = input.nowMs ?? Date.now();
  const tolerance = input.toleranceMs ?? REPLAY_TOLERANCE_MS;
  const age = Math.abs(now - input.timestampSeconds * 1000);
  // Age first: a stale delivery is rejected without spending an HMAC, and the
  // reason is the useful one to report.
  if (!Number.isFinite(input.timestampSeconds) || age > tolerance) {
    return { valid: false, reason: "Timestamp outside the replay window." };
  }
  const expected = signWebhook(input.secret, input.timestampSeconds, input.body);
  if (expected.length !== input.signature.length) {
    return { valid: false, reason: "Signature mismatch." };
  }
  try {
    const ok = timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(input.signature, "utf8")
    );
    return ok ? { valid: true, reason: "" } : { valid: false, reason: "Signature mismatch." };
  } catch {
    return { valid: false, reason: "Signature mismatch." };
  }
}

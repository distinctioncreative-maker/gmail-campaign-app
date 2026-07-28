import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export interface TrackingPayload {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
  recipientId: string;
  /** Sequence step this specific email was sent for (0 = initial, 1+ =
   * follow-ups) — click URLs are stored per-step, since each send has its
   * own set of links. */
  step: number;
  issuedAt?: number;
  expiresAt?: number;
}

export const TRACKING_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Domain-separated derivation of the session secret — a leaked tracking
// token can never be replayed as a session credential, or vice versa.
function trackingSecret(): string {
  return `${env.SESSION_SECRET}:email-tracking`;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", trackingSecret()).update(body).digest());
}

/** Opaque, tamper-evident token identifying one recipient for the public
 * open-pixel/click-redirect endpoints. Carries no secret data itself. */
export function signTrackingToken(payload: TrackingPayload): string {
  const issuedAt = payload.issuedAt ?? Date.now();
  const body = b64url(
    JSON.stringify({
      ...payload,
      issuedAt,
      expiresAt: payload.expiresAt ?? issuedAt + TRACKING_TOKEN_MAX_AGE_MS,
    })
  );
  return `${body}.${sign(body)}`;
}

/** Verifies the signature and returns the payload, or null if the token is
 * missing, malformed, or tampered with. Never throws. */
export function verifyTrackingToken(token: string): TrackingPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(body));
    actual = Buffer.from(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed.ownerUserId === "string" &&
      typeof parsed.organizationId === "string" &&
      typeof parsed.campaignId === "string" &&
      typeof parsed.recipientId === "string" &&
      typeof parsed.step === "number"
    ) {
      if (
        typeof parsed.expiresAt === "number" &&
        (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now())
      ) {
        return null;
      }
      return parsed as TrackingPayload;
    }
    return null;
  } catch {
    return null;
  }
}

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export interface UnsubscribePayload {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
  recipientId: string;
  issuedAt?: number;
  expiresAt?: number;
}

export const UNSUBSCRIBE_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function unsubscribeSecret(): string {
  return `${env.SESSION_SECRET}:one-click-unsubscribe`;
}

function sign(body: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(body)
    .digest("base64url");
}

export function signUnsubscribeToken(payload: UnsubscribePayload): string {
  const issuedAt = payload.issuedAt ?? Date.now();
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      issuedAt,
      expiresAt:
        payload.expiresAt ?? issuedAt + UNSUBSCRIBE_TOKEN_MAX_AGE_MS,
    })
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Verify a public opt-out token without throwing. The HMAC uses a
 * domain-separated secret, so this token cannot be replayed as a session or
 * email-tracking credential.
 */
export function verifyUnsubscribeToken(
  token: string
): UnsubscribePayload | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const suppliedSignature = token.slice(dot + 1);

  let expected: Buffer;
  let supplied: Buffer;
  try {
    expected = Buffer.from(sign(body));
    supplied = Buffer.from(suppliedSignature);
  } catch {
    return null;
  }
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    if (
      typeof parsed.ownerUserId !== "string" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.campaignId !== "string" ||
      typeof parsed.recipientId !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return parsed as unknown as UnsubscribePayload;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(
  payload: UnsubscribePayload,
  baseUrl = env.APP_BASE_URL
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/u/${signUnsubscribeToken(payload)}`;
}

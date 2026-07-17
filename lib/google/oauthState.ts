import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/** Signed short-lived state for the OAuth callback (CSRF protection). */

function stateKey(): Uint8Array {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set (32+ chars).");
  }
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function signOauthState(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: "gmail-connect" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateKey());
}

export async function verifyOauthState(state: string): Promise<string> {
  const { payload } = await jwtVerify(state, stateKey());
  if (payload.purpose !== "gmail-connect" || typeof payload.sub !== "string") {
    throw new Error("Invalid OAuth state");
  }
  return payload.sub;
}

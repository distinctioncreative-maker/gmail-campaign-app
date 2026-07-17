import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "__session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

export interface SessionIdentity {
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Exchange a verified Firebase ID token for a session cookie.
 * Enforces the allowed Workspace domain: the hd claim is checked when
 * present, and the email domain is always checked (hd alone is not trusted).
 */
export async function createSessionCookie(idToken: string): Promise<{
  cookieValue: string;
  maxAgeSeconds: number;
  identity: SessionIdentity;
}> {
  const decoded = await adminAuth().verifyIdToken(idToken, true);

  const email = decoded.email?.toLowerCase();
  if (!email || !decoded.email_verified) {
    throw new AuthError("Your Google account email is not verified.");
  }

  const allowedDomain = env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN.toLowerCase();
  if (allowedDomain) {
    const emailDomain = email.split("@")[1] ?? "";
    const hd = typeof decoded.hd === "string" ? decoded.hd.toLowerCase() : null;
    if (emailDomain !== allowedDomain || (hd !== null && hd !== allowedDomain)) {
      throw new AuthError(
        `This app is restricted to ${allowedDomain} accounts. Sign in with your work account.`
      );
    }
  }

  const cookieValue = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });

  return {
    cookieValue,
    maxAgeSeconds: SESSION_DURATION_MS / 1000,
    identity: {
      userId: decoded.uid,
      email,
      displayName: typeof decoded.name === "string" ? decoded.name : email,
    },
  };
}

/** Verify the session cookie on the current request. Returns null when absent/invalid. */
export async function verifySession(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const email = decoded.email?.toLowerCase() ?? "";
    return {
      userId: decoded.uid,
      email,
      displayName: typeof decoded.name === "string" ? decoded.name : email,
    };
  } catch {
    return null;
  }
}

export class AuthError extends Error {}

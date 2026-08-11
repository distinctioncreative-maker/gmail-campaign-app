import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { allowlistMisconfigured, isAllowedAccount, parseAllowedDomains } from "./domains";
import { effectiveSignupMode } from "@/lib/platform/state";
import { isEmailBanned } from "@/lib/platform/state";
import { isPlatformOperator } from "@/lib/platform/operators";

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

  // "open" mode lets any verified Google account sign in (consumers get a
  // private per-user workspace downstream). Default "allowlist" mode keeps
  // sign-in restricted to the configured work domains.
  // Runtime rather than the env var alone, so the doors can be shut in seconds
  // during an incident instead of after a deploy. See lib/platform/state.ts.
  // Break glass.
  //
  // Closing signup used to be unrecoverable from inside the product, and the
  // deadlock was exact: reopening it needs requireStepUp, step-up needs a
  // sign-in inside the last 30 minutes, and signing in is what "closed" refuses.
  // The stored value also wins over the env var, so redeploying with
  // SIGNUP_MODE=allowlist could not rescue it either. The only way out was
  // editing Firestore by hand, which is not a thing to discover during the
  // incident that made you close the doors.
  //
  // A platform operator is therefore exempt from the signup gate. This grants no
  // extra authority: the address is matched against PLATFORM_OWNER_EMAILS, an
  // environment variable no database write can reach, and it is the same list
  // that already governs the portal. Everything downstream, the ban check, the
  // Firebase revocation check, requireOperator itself, is unchanged.
  //
  // Placed after the email-verified check and before the ban check on purpose:
  // an operator must still hold a verified address, and an operator who has
  // somehow been banned should stay banned.
  const isOperator = isPlatformOperator(email, env.PLATFORM_OWNER_EMAILS);

  const signupMode = await effectiveSignupMode();
  if (signupMode === "closed" && !isOperator) {
    throw new AuthError(
      // Says what is true. This gate runs on every sign-in, not only the first
      // one, so a closed deployment locks out existing customers as well. The
      // previous wording told them their account still worked and to contact
      // support, which sent people to a support queue to be told the same thing.
      "Cadence sign-in is paused right now, including for existing accounts. This is temporary and nothing in your account has changed."
    );
  }
  if (signupMode !== "open" && !isOperator) {
    const allowedDomains = parseAllowedDomains(env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN);
    // Fail closed: an empty allowlist means "no restriction", which is only
    // acceptable in development. In production, refuse sign-in until an admin
    // configures ALLOWED_GOOGLE_WORKSPACE_DOMAIN so we never auto-provision
    // orgs/admins for arbitrary Google accounts.
    if (allowlistMisconfigured(allowedDomains, env.NODE_ENV === "production")) {
      throw new AuthError(
        "Sign-in isn't configured yet. An administrator must set the allowed work-email domains before anyone can sign in."
      );
    }
    const hd = typeof decoded.hd === "string" ? decoded.hd : null;
    if (!isAllowedAccount(email, hd, allowedDomains)) {
      throw new AuthError(
        `This app is restricted to ${allowedDomains.join(", ")} accounts. Sign in with your work account.`
      );
    }
  }

  // Checked at the point a session is minted, so a banned person cannot get a
  // cookie at all rather than getting one that fails on the next request.
  if (await isEmailBanned(email)) {
    throw new AuthError(
      "This account cannot be used. If you believe that is a mistake, contact support."
    );
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

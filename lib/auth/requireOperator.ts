import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "./session";
import {
  isPlatformOperator,
  platformConfigured,
  stepUpSatisfied,
} from "@/lib/platform/operators";

/**
 * The guard on the owner portal.
 *
 * A deliberate sibling of `requireUser`, not a wrapper around it, for the same
 * reason `requireApiKey` is separate: two guards that answer different questions
 * should not share a code path where a change to one silently alters the other.
 * `requireUser` resolves a tenant and a role. This resolves neither, because an
 * operator acts on every tenant and holds no role in any of them.
 *
 * Three properties worth stating:
 *
 * **It verifies the cookie itself rather than trusting a resolved context.** The
 * email an operator is matched against comes from the session cookie Firebase
 * signed, not from a user document, because a user document is writable by the
 * app and the operator list must not be satisfiable by a database write.
 *
 * **A non-operator gets NotFound, not Forbidden.** A 403 confirms the portal
 * exists and that the URL was right, which is exactly the information worth
 * withholding. There is no reason for anyone who is not an operator to learn the
 * difference.
 *
 * **Destructive actions need a recent sign-in.** A five-day session is fine for
 * reading a dashboard and wrong for suspending a customer.
 */

export class NotAnOperatorError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotAnOperatorError";
  }
}

export class StepUpRequiredError extends Error {
  constructor() {
    super("Sign in again to confirm this action.");
    this.name = "StepUpRequiredError";
  }
}

export interface OperatorContext {
  userId: string;
  email: string;
  /** Unix seconds, from the cookie's auth_time claim. */
  authTimeSeconds: number;
}

/**
 * Resolve the operator, or throw.
 *
 * Note the ordering: whether the platform is configured at all is checked before
 * anything else, so a deployment with no operator list behaves as though the
 * portal does not exist rather than as though nobody has access to it.
 */
export async function requireOperator(): Promise<OperatorContext> {
  if (!platformConfigured(env.PLATFORM_OWNER_EMAILS)) throw new NotAnOperatorError();

  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) throw new NotAnOperatorError();

  let decoded;
  try {
    // checkRevoked, like every other session verification in the app, so signing
    // out everywhere ends platform access too.
    decoded = await adminAuth().verifySessionCookie(cookie, true);
  } catch {
    throw new NotAnOperatorError();
  }

  const email = String(decoded.email ?? "").toLowerCase();
  // Unverified email is not an identity. Google accounts in this flow are
  // verified, and an unverified one reaching here means something is wrong.
  if (!email || decoded.email_verified === false) throw new NotAnOperatorError();
  if (!isPlatformOperator(email, env.PLATFORM_OWNER_EMAILS)) throw new NotAnOperatorError();

  return {
    userId: decoded.uid,
    email,
    authTimeSeconds: Number(decoded.auth_time) || 0,
  };
}

/**
 * Resolve the operator and insist the sign-in is recent.
 *
 * Takes no action argument, because every mutation the portal offers needs this:
 * STEP_UP_ACTIONS lists all ten and a test asserts the list stays complete. An
 * argument would imply some platform write exists that does not need a fresh
 * sign-in, and inviting a caller to decide which is exactly the decision that
 * gets made wrong.
 */
export async function requireStepUp(): Promise<OperatorContext> {
  const ctx = await requireOperator();
  if (!stepUpSatisfied(ctx.authTimeSeconds)) throw new StepUpRequiredError();
  return ctx;
}

// There is deliberately no helper for rendering a portal link in the customer
// app. It was written and then removed: a link would advertise the portal's
// existence to anyone who shares a screen, and an operator who needs it can type
// the path. Obscurity is not the security boundary here, requireOperator is, but
// there is no reason to spend the obscurity for a convenience nobody needs.

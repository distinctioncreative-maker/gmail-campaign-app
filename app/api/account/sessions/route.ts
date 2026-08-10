import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { auditActor, recordAudit } from "@/lib/audit/log";

/**
 * What the account knows about its own sessions, and how to end them.
 *
 * The GET deliberately returns two timestamps and no device list. Firebase does
 * not expose the session cookies it has issued, so a list would be invented, and
 * an invented list is worse than none: someone would read "1 active session" and
 * conclude the copy they are worried about is not there.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({
    lastLoginAt: ctx.user.lastLoginAt,
    sessionsRevokedAt: ctx.user.sessionsRevokedAt,
  });
});

/**
 * Sign out everywhere, including here.
 *
 * Signing the caller out too is the point rather than a side effect: the honest
 * meaning of the action is "end every session", and one that spared the current
 * browser would leave the most recently used session alive, which is exactly
 * backwards if the reason for pressing it is a device that is no longer yours.
 */
export const POST = handleApiErrors(async () => {
  const ctx = await requireUser();
  const at = await revokeAllSessions(ctx.userId);

  await recordAudit(auditActor(ctx), {
    action: "session.revoked_everywhere",
    summary: `${ctx.email} signed out of every device.`,
  });

  const res = NextResponse.json({
    ok: true,
    sessionsRevokedAt: at,
    message: "Signed out on every device. Sign in again to continue.",
  });
  // The cookie here is already dead to `verifySessionCookie`, since it was
  // issued before the revocation. Clearing it as well means the browser stops
  // presenting a credential that can only fail.
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});

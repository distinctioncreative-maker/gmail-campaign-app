import "server-only";
import { adminAuth, firestore } from "@/lib/firebase/admin";

/**
 * Signing out everywhere.
 *
 * The gap this closes: a session cookie lives for five days, so a cookie copied
 * off a shared or stolen laptop stays usable for up to five days and there was
 * no way for anyone, the owner or an admin, to end it early. Clearing the cookie
 * in one browser does nothing to a copy of it somewhere else.
 *
 * **This is deliberately not the `tokenVersion` field the plan called for.** A
 * version number on the user document would mean a Firestore read on the
 * authentication path of every single request, to reimplement a check that
 * already runs. `lib/auth/session.ts` calls
 * `verifySessionCookie(cookie, true)`, and that second argument is
 * `checkRevoked`: it verifies the cookie against the account's
 * `tokensValidAfterTime` in Firebase Auth. So revocation was already enforced on
 * every request. What was missing was anything that ever set it.
 *
 * `revokeRefreshTokens` sets that timestamp, and every session cookie issued
 * before it immediately stops verifying. One call, no new per-request cost, and
 * no second source of truth to drift.
 *
 * What this honestly cannot do is list the sessions being ended. Firebase does
 * not expose the issued cookies, so there is no device list to show and the
 * interface must not imply one: it is an all-or-nothing action, and saying so is
 * better than a plausible-looking list that is really a guess.
 */

/**
 * End every session for a user, including the caller's own.
 *
 * Returns the moment of revocation. Best-effort on the Firestore write, which is
 * display metadata: the revocation is already in force once Firebase has it, and
 * failing the whole action because a timestamp did not save would leave the
 * caller thinking their sessions are still live when they are not.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  await adminAuth().revokeRefreshTokens(userId);
  const at = Date.now();
  await firestore()
    .collection("users")
    .doc(userId)
    .update({ sessionsRevokedAt: at, updatedAt: at })
    .catch(() => {
      /* Display metadata only: see above. */
    });
  return at;
}

/**
 * Revoke without failing the caller.
 *
 * For paths where signing sessions out is a consequence rather than the point,
 * such as scheduling a deletion. A revocation that could not be completed must
 * not stop the deletion request itself from being recorded.
 */
export async function revokeAllSessionsQuietly(userId: string): Promise<boolean> {
  try {
    await revokeAllSessions(userId);
    return true;
  } catch {
    return false;
  }
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UserSchema } from "@/schemas/user";

/**
 * Session revocation is enforced by Firebase, not by our own field, so what is
 * worth testing here is the wiring rather than arithmetic: that the check which
 * makes revocation work is still switched on, that nothing has quietly grown a
 * second source of truth, and that the schema addition cannot affect access.
 */

const session = readFileSync("lib/auth/session.ts", "utf8");
const sessions = readFileSync("lib/auth/sessions.ts", "utf8");
const requireUser = readFileSync("lib/auth/requireUser.ts", "utf8");
const deletion = readFileSync("lib/account/deletion.ts", "utf8");
const route = readFileSync("app/api/account/sessions/route.ts", "utf8");

describe("revocation is actually checked on every request", () => {
  it("verifies the session cookie with checkRevoked switched on", () => {
    // This single boolean is the whole mechanism. Without it,
    // revokeRefreshTokens sets a timestamp nobody reads and every revoked
    // cookie keeps working for the rest of its five days, with no test
    // anywhere else in the suite failing.
    expect(session).toMatch(/verifySessionCookie\(\s*cookie\s*,\s*true\s*\)/);
  });

  it("revokes through Firebase rather than a field of our own", () => {
    expect(sessions).toContain("revokeRefreshTokens");
  });
});

describe("sessionsRevokedAt is display metadata only", () => {
  it("defaults to null for a user document written before it existed", () => {
    const parsed = UserSchema.parse({
      userId: "u-1",
      organizationId: "org-1",
      email: "a@b.com",
      displayName: "A",
      role: "ADMIN",
      roleLabel: null,
      active: true,
      tenantType: "WORKSPACE",
      onboardingStatus: "NEW",
      timezone: "America/New_York",
      createdAt: 1,
      updatedAt: 1,
      lastLoginAt: 1,
    });
    expect(parsed.sessionsRevokedAt).toBeNull();
  });

  it("is never consulted by an access decision", () => {
    // The usual hazard with a `.default()` on a field added after documents
    // exist is that the default becomes indistinguishable from a real value.
    // That is harmless here only for as long as nothing authorises against it,
    // so the invariant is asserted rather than assumed: if requireUser ever
    // reads this field, the default would silently grant access to a session
    // that had been revoked.
    expect(requireUser).not.toContain("sessionsRevokedAt");
    expect(session).not.toContain("sessionsRevokedAt");
  });
});

describe("signing out everywhere", () => {
  it("ends the caller's own session too", () => {
    // Sparing the current browser would leave the most recently used session
    // alive, which is backwards if the reason for pressing the button is a
    // device that is no longer yours.
    expect(route).toContain("SESSION_COOKIE");
    expect(route).toMatch(/maxAge:\s*0/);
  });

  it("records the action in the audit log", () => {
    expect(route).toContain("session.revoked_everywhere");
  });

  it("does not claim to list devices", () => {
    // Firebase does not expose issued session cookies. A route reporting a
    // session count or a device list would be inventing one, and someone would
    // rely on it.
    expect(route).not.toMatch(/activeSessions|deviceCount|sessions:\s*\[/);
  });
});

describe("deletion is terminal", () => {
  it("revokes sessions as part of the purge", () => {
    // Otherwise a cookie issued before the purge still verifies for up to five
    // days, and requireUser would clear the tombstone and provision a fresh
    // account without the person authenticating again.
    expect(deletion).toContain("revokeAllSessionsQuietly");
  });

  it("uses the quiet variant, so a revocation failure cannot abort a purge", () => {
    expect(deletion).not.toMatch(/await revokeAllSessions\(/);
  });

  it("does not revoke when deletion is merely scheduled", () => {
    // The grace period exists so someone can change their mind. Signing them
    // out at the moment they schedule it makes cancelling harder than
    // requesting, which is the wrong way round for a destructive action.
    const requestRoute = readFileSync("app/api/account/deletion/route.ts", "utf8");
    expect(requestRoute).not.toContain("revokeAllSessions");
  });
});

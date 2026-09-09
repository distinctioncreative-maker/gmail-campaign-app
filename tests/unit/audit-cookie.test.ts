import { describe, expect, it } from "vitest";

// Plain ESM script under scripts/, imported directly so the guard tests the
// real module the audit runs.
import { readCookie } from "../../scripts/audit/cookie.mjs";

/**
 * The audit's own reliability. A cookie that arrives with a placeholder's angle
 * brackets still attached costs a ten-minute run that reports nothing but
 * redirects, so the wrapping comes off and a value that is not a JWT is
 * rejected before Chromium starts.
 */

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJl-_x";

describe("readCookie", () => {
  it("passes a clean token through unchanged", () => {
    expect(readCookie(JWT).value).toBe(JWT);
  });

  it("treats absence as public-routes-only rather than an error", () => {
    expect(readCookie(null).value).toBeNull();
    expect(readCookie(undefined).value).toBeNull();
    expect(readCookie("   ").value).toBeNull();
  });

  it("peels the wrappers a paste picks up", () => {
    for (const wrapped of [
      `<${JWT}>`,
      `"${JWT}"`,
      `'${JWT}'`,
      `\`${JWT}\``,
      `  ${JWT}\n`,
      `<'${JWT}'>`,
      `< ${JWT} >`,
    ]) {
      expect(readCookie(wrapped).value).toBe(JWT);
    }
  });

  it("refuses a value that is not a JWT, without echoing it", () => {
    const secretish = "not-a-token-but-sensitive";
    expect(() => readCookie(secretish)).toThrow(/three dot-separated/);
    try {
      readCookie(secretish);
    } catch (error) {
      expect((error as Error).message).not.toContain(secretish);
    }
  });

  it("still refuses when the damage is inside the token", () => {
    expect(() => readCookie(`${JWT} extra`)).toThrow();
    expect(() => readCookie(JWT.replace(".", " "))).toThrow();
  });
});

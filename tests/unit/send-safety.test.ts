import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSafety(envVars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envVars)) vi.stubEnv(k, v);
  return import("@/lib/gmail/safety");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("applySendSafety (test-mode destination override)", () => {
  it("forces destination to the test account and prefixes [TEST]", async () => {
    const { applySendSafety } = await loadSafety({
      TEST_MODE: "true",
      TEST_EMAIL_DESTINATION: "me@company.com",
    });
    const out = applySendSafety({ to: "reallead@example.com", subject: "Quick question" });
    expect(out.to).toBe("me@company.com");
    expect(out.subject).toBe("[TEST] Quick question");
  });

  it("does not double-prefix [TEST]", async () => {
    const { applySendSafety } = await loadSafety({
      TEST_MODE: "true",
      TEST_EMAIL_DESTINATION: "me@company.com",
    });
    const out = applySendSafety({ to: "x@y.com", subject: "[TEST] already" });
    expect(out.subject).toBe("[TEST] already");
  });

  it("treats any value other than the literal 'false' as test mode", async () => {
    const { applySendSafety } = await loadSafety({
      TEST_MODE: "no",
      TEST_EMAIL_DESTINATION: "me@company.com",
    });
    expect(applySendSafety({ to: "lead@x.com", subject: "s" }).to).toBe("me@company.com");
  });

  it("throws when test mode is on but no test destination is configured", async () => {
    const { applySendSafety, TestModeConfigError } = await loadSafety({
      TEST_MODE: "true",
      TEST_EMAIL_DESTINATION: "",
    });
    expect(() => applySendSafety({ to: "lead@x.com", subject: "s" })).toThrow(
      TestModeConfigError
    );
  });

  it("passes envelope through unchanged only when TEST_MODE=false", async () => {
    const { applySendSafety } = await loadSafety({
      TEST_MODE: "false",
      TEST_EMAIL_DESTINATION: "me@company.com",
    });
    const out = applySendSafety({ to: "lead@x.com", subject: "Hello" });
    expect(out).toEqual({ to: "lead@x.com", subject: "Hello" });
  });
});

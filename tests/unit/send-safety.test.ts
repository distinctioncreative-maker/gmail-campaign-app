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
  it("forces destination to the test account and prefixes [TEST] when testMode=true", async () => {
    const { applySendSafety } = await loadSafety({ TEST_EMAIL_DESTINATION: "me@company.com" });
    const out = applySendSafety({ to: "reallead@example.com", subject: "Quick question" }, true);
    expect(out.to).toBe("me@company.com");
    expect(out.subject).toBe("[TEST] Quick question");
  });

  it("does not double-prefix [TEST]", async () => {
    const { applySendSafety } = await loadSafety({ TEST_EMAIL_DESTINATION: "me@company.com" });
    const out = applySendSafety({ to: "x@y.com", subject: "[TEST] already" }, true);
    expect(out.subject).toBe("[TEST] already");
  });

  it("throws when test mode is on but no test destination is configured", async () => {
    const { applySendSafety, TestModeConfigError } = await loadSafety({
      TEST_EMAIL_DESTINATION: "",
    });
    expect(() => applySendSafety({ to: "lead@x.com", subject: "s" }, true)).toThrow(
      TestModeConfigError
    );
  });

  it("passes the envelope through unchanged only when testMode=false", async () => {
    const { applySendSafety } = await loadSafety({ TEST_EMAIL_DESTINATION: "me@company.com" });
    const out = applySendSafety({ to: "lead@x.com", subject: "Hello" }, false);
    expect(out).toEqual({ to: "lead@x.com", subject: "Hello" });
  });
});

describe("envForcesTestMode (deployment lock)", () => {
  async function loadEnv(envVars: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(envVars)) vi.stubEnv(k, v);
    return import("@/lib/env");
  }

  it("locks when FORCE_TEST_MODE=true", async () => {
    const { envForcesTestMode } = await loadEnv({ FORCE_TEST_MODE: "true" });
    expect(envForcesTestMode()).toBe(true);
  });

  it("locks when legacy TEST_MODE=true", async () => {
    const { envForcesTestMode } = await loadEnv({ TEST_MODE: "true" });
    expect(envForcesTestMode()).toBe(true);
  });

  it("does not lock when both are unset (the in-app switch governs)", async () => {
    const { envForcesTestMode } = await loadEnv({ FORCE_TEST_MODE: "", TEST_MODE: "" });
    expect(envForcesTestMode()).toBe(false);
  });
});

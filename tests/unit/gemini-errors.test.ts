import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  // ERROR_WEBHOOK_URL is read by reportError, which every failure now goes
  // through. Zod gives it a default in production; a mock that omits it made
  // geminiFailure throw instead of returning, which is exactly the kind of
  // thing a stub hides.
  env: {
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_API_KEY: "test-key",
    ERROR_WEBHOOK_URL: "",
  },
}));

const { geminiEndpoint, geminiFailure } = await import("@/lib/ai/gemini");

/**
 * The failure a deployment actually meets.
 *
 * Google retires a model, the next AI request comes back 404 with a body that
 * says exactly what to do, and the ten call sites that each hand-rolled this
 * cut that body off at 140 characters. What reached the user was "The AI
 * writer had a problem (404). This model models/gemini-2.5-flash is no longer
 * available to new users. Please update your" and then nothing.
 */

/** The real body, as returned by the API. */
const RETIRED =
  '{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer ' +
  'available to new users. Please update your code to use a supported model such as ' +
  'one listed by the models.list endpoint.","status":"NOT_FOUND"}}';

describe("gemini failures", () => {
  it("names the model and how to find a working one when it has been retired", () => {
    const error = geminiFailure(404, RETIRED, "The AI writer");
    expect(error.message).toContain("gemini-2.5-flash");
    expect(error.message).toContain("GEMINI_MODEL");
    expect(error.message).toContain("models?key=");
    // The whole point: the advice must survive.
    expect(error.message).toContain("supported model");
    // And it must not tell someone to retry a thing that cannot succeed.
    expect(error.message).not.toMatch(/try again/i);
  });

  it("keeps Google's own account of which quota was hit", () => {
    /**
     * A 429 is two different problems wearing one status code: a per-minute
     * burst that clears itself, and a per-day or per-model allowance that
     * waiting cannot fix. Only the body says which, so only the body settles
     * it. The first version of this branch replaced it with reassurance.
     */
    const body = JSON.stringify({
      error: {
        code: 429,
        message: "You exceeded your current quota.",
        details: [
          {
            violations: [
              { quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "0" },
            ],
          },
        ],
      },
    });
    const error = geminiFailure(429, body, "The AI writer");
    expect(error.message).toContain("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
    expect(error.message).toContain("limit 0");
    expect(error.message).toContain("You exceeded your current quota.");
    // And still says what to do about each of the two cases.
    expect(error.message).toMatch(/per-minute/i);
    expect(error.message).toMatch(/billing/i);
  });

  it("falls back to the raw body when a 429 carries no structured violation", () => {
    const error = geminiFailure(429, "plain text refusal", "The AI writer");
    expect(error.message).toContain("plain text refusal");
  });

  it("keeps enough of the body on any other status to diagnose it", () => {
    const body = "x".repeat(500);
    const error = geminiFailure(500, body, "The AI writer");
    expect(error.message).toContain("The AI writer had a problem (500)");
    // More than the 140 characters that hid the answer, and still bounded.
    expect(error.message.length).toBeGreaterThan(200);
    expect(error.message.length).toBeLessThan(400);
  });

  it("falls back to advice rather than an empty sentence", () => {
    expect(geminiFailure(503, "", "The AI writer").message).toContain("Please try again");
  });

  it("builds the endpoint from the configured model", () => {
    expect(geminiEndpoint()).toContain("/models/gemini-2.5-flash:generateContent");
    expect(geminiEndpoint()).toContain("key=test-key");
  });
});

describe("a fail-closed limiter that cannot reach Firestore", () => {
  it("reports before it refuses", async () => {
    /**
     * The AI bucket is the one caller that fails closed. Before this, any
     * Firestore error on `rateLimits` refused every AI request in the
     * workspace with the ordinary "limit reached" message and threw the cause
     * away, so the real fault was undiscoverable from outside.
     */
    vi.resetModules();
    const reportError = vi.fn();
    vi.doMock("@/lib/observability/report", () => ({ reportError }));
    vi.doMock("@/lib/firebase/admin", () => ({
      firestore: () => ({
        collection: () => ({ doc: () => ({}) }),
        runTransaction: async () => {
          throw new Error("PERMISSION_DENIED: Missing or insufficient permissions.");
        },
      }),
    }));

    const { enforceRateLimit } = await import("@/lib/util/rateLimit");

    await expect(enforceRateLimit("ai-generation", "org__user", 60, 1000, { failClosed: true }))
      .resolves.toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({ scope: "rateLimit", kind: "ai-generation" });

    // And a fail-open bucket still lets traffic through, while still saying so.
    await expect(enforceRateLimit("public", "key", 5, 1000)).resolves.toBe(true);
    expect(reportError).toHaveBeenCalledTimes(2);

    vi.doUnmock("@/lib/observability/report");
    vi.doUnmock("@/lib/firebase/admin");
  });
});

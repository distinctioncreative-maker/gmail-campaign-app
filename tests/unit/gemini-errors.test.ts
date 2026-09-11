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

const { AiUnavailableError, geminiEndpoint, geminiFailure } = await import("@/lib/ai/gemini");

/**
 * The failure a deployment actually meets.
 *
 * Google retires a model, the next AI request comes back 404 with a body that
 * says exactly what to do, and the ten call sites that each hand-rolled this
 * cut that body off at 140 characters. What reached the user was "The AI
 * writer had a problem (404). This model models/gemini-2.5-flash is no longer
 * available to new users. Please update your" and then nothing.
 */

/**
 * Read the operator-facing text. For a fault the deployment owns, the full
 * account lives on `detail` and `message` is the sentence a tenant may see.
 */
function operatorText(error: Error): string {
  return error instanceof AiUnavailableError ? error.detail : error.message;
}

/** The real body, as returned by the API. */
const RETIRED =
  '{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer ' +
  'available to new users. Please update your code to use a supported model such as ' +
  'one listed by the models.list endpoint.","status":"NOT_FOUND"}}';

describe("gemini failures", () => {
  it("names the model and how to find a working one when it has been retired", () => {
    const error = geminiFailure(404, RETIRED, "The AI writer");
    const text = operatorText(error);
    expect(text).toContain("gemini-2.5-flash");
    expect(text).toContain("GEMINI_MODEL");
    expect(text).toContain("models?key=");
    // The whole point: the advice must survive.
    expect(text).toContain("supported model");
    // A retired model is the operator's to fix, so a tenant is not told to go
    // and set an environment variable they cannot reach.
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.message).not.toContain("GEMINI_MODEL");
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
    const text = operatorText(geminiFailure(429, body, "The AI writer"));
    expect(text).toContain("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
    expect(text).toContain("limit 0");
    expect(text).toContain("You exceeded your current quota.");
    // And still says what to do about each of the two cases.
    expect(text).toMatch(/per-minute/i);
    expect(text).toMatch(/billing/i);
  });

  it("falls back to the raw body when a 429 carries no structured violation", () => {
    expect(operatorText(geminiFailure(429, "plain text refusal", "The AI writer"))).toContain(
      "plain text refusal"
    );
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

describe("whose fault it is", () => {
  it("hides the operator's billing from the tenant, and keeps it in the log", () => {
    /**
     * The message that started this: a depleted prepaid balance told every
     * sales rep in every customer workspace to go and manage the operator's
     * AI Studio project. They can act on none of it, and it puts one tenant's
     * infrastructure in front of all of them.
     */
    const body = JSON.stringify({
      error: {
        code: 429,
        message:
          "Your prepayment credits are depleted. Please go to AI Studio at " +
          "https://ai.studio/projects to manage your project and billing.",
      },
    });
    const error = geminiFailure(429, body, "The AI writer");

    expect(error).toBeInstanceOf(AiUnavailableError);
    // What a user may see.
    expect(error.message).not.toMatch(/billing/i);
    expect(error.message).not.toContain("ai.studio");
    expect(error.message).not.toMatch(/credits/i);
    expect(error.message).toMatch(/temporarily unavailable/i);
    // What an operator needs, still intact on the same object.
    const detail = (error as InstanceType<typeof AiUnavailableError>).detail;
    expect(detail).toContain("prepayment credits are depleted");
    expect(detail).toContain("ai.studio");
  });

  it("treats a rejected request as the caller's, so the real reason still reaches them", () => {
    /**
     * The other half of the rule. A 400 is usually a prompt the model refused,
     * and blanking that out would turn every fixable mistake into "something
     * went wrong".
     */
    const error = geminiFailure(400, '{"error":{"message":"Invalid JSON payload"}}', "The AI writer");
    expect(error).not.toBeInstanceOf(AiUnavailableError);
    expect(error.message).toContain("Invalid JSON payload");
  });

  it("classifies every status the deployment owns, not just the one that bit us", () => {
    for (const status of [401, 402, 403, 404, 429]) {
      expect(geminiFailure(status, "{}", "The AI writer"), `status ${status}`).toBeInstanceOf(
        AiUnavailableError
      );
    }
    for (const status of [400, 422, 500, 503]) {
      expect(geminiFailure(status, "{}", "The AI writer"), `status ${status}`).not.toBeInstanceOf(
        AiUnavailableError
      );
    }
  });
});

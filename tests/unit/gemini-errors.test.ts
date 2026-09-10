import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { GEMINI_MODEL: "gemini-2.5-flash", GEMINI_API_KEY: "test-key" },
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

  it("tells a rate-limited user to wait rather than to reconfigure", () => {
    const error = geminiFailure(429, '{"error":{"code":429}}', "The AI writer");
    expect(error.message).toMatch(/rate limit/i);
    expect(error.message).not.toContain("GEMINI_MODEL");
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

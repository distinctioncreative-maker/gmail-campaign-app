import { describe, expect, it } from "vitest";
import {
  generateSigningSecret,
  REPLAY_TOLERANCE_MS,
  signedPayload,
  signWebhook,
  verifyWebhook,
} from "@/lib/webhooks/signature";
import {
  backoffMs,
  decideRetry,
  describeAttempt,
  isRetryable,
  isSuccess,
  MAX_ATTEMPTS,
} from "@/lib/webhooks/retry";

const SECRET = "whsec_test_secret_value";
const BODY = JSON.stringify({ event: "reply.received", data: { recipientId: "r1" } });
const NOW = 1_800_000_000_000;
const TS = Math.floor(NOW / 1000);

describe("generateSigningSecret", () => {
  it("is prefixed and unguessable", () => {
    const secret = generateSigningSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
    expect(secret.length).toBeGreaterThan(20);
  });
});

describe("signWebhook and verifyWebhook", () => {
  it("verifies a delivery it just signed", () => {
    const signature = signWebhook(SECRET, TS, BODY);
    expect(verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: BODY, nowMs: NOW }))
      .toEqual({ valid: true, reason: "" });
  });

  it("signs timestamp and body together, which is what makes replay fail", () => {
    // A signature over the body alone is replayable forever: anyone who
    // captures one delivery can resend it indefinitely and it still verifies.
    expect(signedPayload(TS, BODY)).toBe(`${TS}.${BODY}`);
    expect(signWebhook(SECRET, TS, BODY)).not.toBe(signWebhook(SECRET, TS + 1, BODY));
  });

  it("rejects a delivery replayed after the tolerance window", () => {
    const signature = signWebhook(SECRET, TS, BODY);
    const result = verifyWebhook({
      secret: SECRET,
      signature,
      timestampSeconds: TS,
      body: BODY,
      nowMs: NOW + REPLAY_TOLERANCE_MS + 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/replay window/i);
  });

  it("accepts a delivery just inside the window, in both directions", () => {
    // Clock skew runs both ways, so a receiver slightly ahead of us must not
    // reject a legitimate delivery.
    const signature = signWebhook(SECRET, TS, BODY);
    for (const now of [NOW + REPLAY_TOLERANCE_MS - 1000, NOW - REPLAY_TOLERANCE_MS + 1000]) {
      expect(
        verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: BODY, nowMs: now })
          .valid
      ).toBe(true);
    }
  });

  it("rejects a tampered body", () => {
    const signature = signWebhook(SECRET, TS, BODY);
    const tampered = BODY.replace("r1", "r2");
    expect(
      verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: tampered, nowMs: NOW })
        .valid
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = signWebhook("whsec_someone_elses", TS, BODY);
    expect(
      verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: BODY, nowMs: NOW })
        .valid
    ).toBe(false);
  });

  it("rejects garbage signatures without throwing", () => {
    for (const signature of ["", "abc", "z".repeat(64), "not hex at all"]) {
      expect(() =>
        verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: BODY, nowMs: NOW })
      ).not.toThrow();
      expect(
        verifyWebhook({ secret: SECRET, signature, timestampSeconds: TS, body: BODY, nowMs: NOW })
          .valid
      ).toBe(false);
    }
  });

  it("rejects a non-finite timestamp", () => {
    const signature = signWebhook(SECRET, TS, BODY);
    for (const timestampSeconds of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        verifyWebhook({ secret: SECRET, signature, timestampSeconds, body: BODY, nowMs: NOW }).valid
      ).toBe(false);
    }
  });
});

describe("isSuccess and isRetryable", () => {
  it("treats 2xx as delivered", () => {
    for (const status of [200, 201, 202, 204, 299]) expect(isSuccess(status), `${status}`).toBe(true);
    for (const status of [199, 300, 404, 500, null]) expect(isSuccess(status), `${status}`).toBe(false);
  });

  it("retries server errors and transport failures", () => {
    for (const status of [500, 502, 503, 504, null]) {
      expect(isRetryable(status), `${status}`).toBe(true);
    }
  });

  it("does not retry a rejected payload", () => {
    // Sending the identical payload again cannot change a 400 or a 422; it is
    // pure noise in the receiver's logs and ours.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryable(status), `${status}`).toBe(false);
    }
  });

  it("retries the two client errors that mean later", () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(408)).toBe(true);
  });

  it("does not retry 410 Gone, which is an explicit stop", () => {
    expect(isRetryable(410)).toBe(false);
  });
});

describe("decideRetry", () => {
  const fixedRandom = () => 0.5;

  it("reports a successful delivery", () => {
    expect(decideRetry({ status: 200, attempt: 1 }, fixedRandom).outcome).toBe("DELIVERED");
  });

  it("retries a server error with a delay", () => {
    const decision = decideRetry({ status: 503, attempt: 1 }, fixedRandom);
    expect(decision.outcome).toBe("RETRY");
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  it("disables the subscription on 410 Gone", () => {
    const decision = decideRetry({ status: 410, attempt: 1 }, fixedRandom);
    expect(decision.outcome).toBe("DISABLED");
    expect(decision.reason).toMatch(/disabled/i);
  });

  it("fails immediately on a rejected payload, without burning attempts", () => {
    const decision = decideRetry({ status: 422, attempt: 1 }, fixedRandom);
    expect(decision.outcome).toBe("FAILED");
    expect(decision.delayMs).toBe(0);
    expect(decision.reason).toMatch(/cannot change that/i);
  });

  it("gives up after the attempt ceiling", () => {
    expect(decideRetry({ status: 500, attempt: MAX_ATTEMPTS - 1 }, fixedRandom).outcome).toBe("RETRY");
    expect(decideRetry({ status: 500, attempt: MAX_ATTEMPTS }, fixedRandom).outcome).toBe("FAILED");
    expect(decideRetry({ status: 500, attempt: MAX_ATTEMPTS + 5 }, fixedRandom).outcome).toBe("FAILED");
  });

  it("retries a transport failure that produced no status", () => {
    const decision = decideRetry({ status: null, attempt: 1 }, fixedRandom);
    expect(decision.outcome).toBe("RETRY");
    expect(decision.reason).toMatch(/could not reach/i);
  });
});

describe("backoffMs", () => {
  it("grows with each attempt", () => {
    const fixed = () => 1;
    const delays = [1, 2, 3, 4, 5, 6].map((attempt) => backoffMs(attempt, fixed));
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i], `attempt ${i + 1}`).toBeGreaterThan(delays[i - 1]);
    }
  });

  it("only ever spreads deliveries later, never earlier", () => {
    // Jitter runs 50% to 100% of the base rather than symmetrically, so a
    // recovering endpoint is never hit sooner than the backoff intended.
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const delay = backoffMs(1, random);
      expect(delay).toBeGreaterThanOrEqual(15_000);
      expect(delay).toBeLessThanOrEqual(30_000);
    }
  });

  it("spreads a thundering herd across a real range", () => {
    // Without jitter, every queued delivery for a recovered endpoint arrives in
    // the same instant, which is how a struggling server is kept down.
    const delays = new Set(Array.from({ length: 50 }, () => backoffMs(3)));
    expect(delays.size).toBeGreaterThan(10);
  });

  it("clamps an attempt number outside the table", () => {
    expect(backoffMs(0, () => 1)).toBe(30_000);
    expect(backoffMs(99, () => 1)).toBe(60 * 60_000);
    expect(Number.isFinite(backoffMs(-5, () => 1))).toBe(true);
  });
});

describe("describeAttempt", () => {
  it("says what happened in each outcome", () => {
    const fixed = () => 1;
    expect(describeAttempt({ status: 200, attempt: 1 }, decideRetry({ status: 200, attempt: 1 }, fixed)))
      .toMatch(/delivered/i);
    expect(describeAttempt({ status: 503, attempt: 2 }, decideRetry({ status: 503, attempt: 2 }, fixed)))
      .toMatch(/retrying in \d+s/);
    expect(describeAttempt({ status: null, attempt: 1 }, decideRetry({ status: null, attempt: 1 }, fixed)))
      .toMatch(/no response/i);
  });
});

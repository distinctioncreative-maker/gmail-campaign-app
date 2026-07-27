import { describe, expect, it } from "vitest";
import { signTrackingToken, verifyTrackingToken } from "@/lib/tracking/token";

const payload = {
  ownerUserId: "user-1",
  organizationId: "org-1",
  campaignId: "camp-1",
  recipientId: "recip-1",
  step: 0,
};

describe("tracking token", () => {
  it("round-trips a signed payload", () => {
    const token = signTrackingToken(payload);
    expect(verifyTrackingToken(token)).toEqual(payload);
  });

  it("rejects a tampered payload segment", () => {
    const token = signTrackingToken(payload);
    const [body, sig] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, recipientId: "someone-elses-recipient" })).toString(
      "base64url"
    );
    expect(verifyTrackingToken(`${tamperedBody}.${sig}`)).toBeNull();
    void body;
  });

  it("rejects a tampered signature", () => {
    const token = signTrackingToken(payload);
    const [body] = token.split(".");
    expect(verifyTrackingToken(`${body}.not-the-real-signature`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyTrackingToken("")).toBeNull();
    expect(verifyTrackingToken("no-dot-here")).toBeNull();
    expect(verifyTrackingToken("not-base64.also-not-base64")).toBeNull();
  });

  it("distinguishes different recipients", () => {
    const a = signTrackingToken(payload);
    const b = signTrackingToken({ ...payload, recipientId: "recip-2" });
    expect(a).not.toBe(b);
  });
});

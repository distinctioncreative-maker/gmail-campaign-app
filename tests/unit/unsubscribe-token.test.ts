import { describe, expect, it } from "vitest";
import {
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "@/lib/unsubscribe/token";

const payload = {
  ownerUserId: "user-1",
  organizationId: "org-1",
  campaignId: "campaign-1",
  recipientId: "recipient-1",
};

describe("unsubscribe tokens", () => {
  it("round-trips a signed token", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(payload))).toMatchObject(
      payload
    );
  });

  it("rejects tampering and expiration", () => {
    const token = signUnsubscribeToken(payload);
    const [body] = token.split(".");
    expect(verifyUnsubscribeToken(`${body}.tampered`)).toBeNull();
    expect(
      verifyUnsubscribeToken(
        signUnsubscribeToken({
          ...payload,
          issuedAt: Date.now() - 10_000,
          expiresAt: Date.now() - 1,
        })
      )
    ).toBeNull();
  });

  it("builds a URL under the configured public endpoint", () => {
    const url = unsubscribeUrl(payload, "https://cadence.example/");
    expect(url).toMatch(/^https:\/\/cadence\.example\/api\/u\//);
    const token = url.split("/").at(-1) ?? "";
    expect(verifyUnsubscribeToken(token)).toMatchObject(payload);
  });
});

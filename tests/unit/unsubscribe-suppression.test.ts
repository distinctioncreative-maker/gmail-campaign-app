import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeSuppression,
  unsubscribeSuppressionId,
} from "@/lib/unsubscribe/suppression";

describe("one-click suppression records", () => {
  it("uses a stable identifier without exposing the email address", () => {
    const first = unsubscribeSuppressionId("lead@example.com");
    const second = unsubscribeSuppressionId("lead@example.com");
    expect(first).toBe(second);
    expect(first).not.toContain("lead@example.com");
  });

  it("builds an active user suppression scoped to the token owner", () => {
    const suppression = buildUnsubscribeSuppression({
      owner: { userId: "user-1", organizationId: "org-1" },
      email: "Lead@Example.com",
      normalizedEmail: "lead@example.com",
      campaignId: "campaign-1",
      recipientId: "recipient-1",
      source: "ONE_CLICK",
      now: 1234,
    });
    expect(suppression).toMatchObject({
      ownerUserId: "user-1",
      organizationId: "org-1",
      normalizedEmail: "lead@example.com",
      reason: "UNSUBSCRIBED",
      scope: "USER",
      source: "ONE_CLICK",
      active: true,
      createdAt: 1234,
      updatedAt: 1234,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  commitRecipientOutcome: vi.fn(),
  getCampaign: vi.fn(),
  getRecipient: vi.fn(),
  recordEvent: vi.fn(),
  recordEngagementByEmail: vi.fn(),
  addNotification: vi.fn(),
  cancelRecipientQueue: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/repositories/campaigns", () => ({
  commitRecipientOutcome: mocks.commitRecipientOutcome,
  getCampaign: mocks.getCampaign,
  getRecipient: mocks.getRecipient,
  recordEvent: mocks.recordEvent,
}));
vi.mock("@/lib/repositories/contacts", () => ({
  recordEngagementByEmail: mocks.recordEngagementByEmail,
}));
vi.mock("@/lib/repositories/notifications", () => ({
  addNotification: mocks.addNotification,
}));
vi.mock("@/lib/campaigns/monitoring", () => ({
  cancelRecipientQueue: mocks.cancelRecipientQueue,
}));
vi.mock("@/lib/util/rateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/observability/report", () => ({ reportError: vi.fn() }));

import { GET, POST } from "@/app/api/u/[token]/route";
import { signUnsubscribeToken } from "@/lib/unsubscribe/token";

const payload = {
  ownerUserId: "user-1",
  organizationId: "org-1",
  campaignId: "campaign-1",
  recipientId: "recipient-1",
};

describe("one-click unsubscribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.getCampaign.mockResolvedValue({
      campaignId: payload.campaignId,
      schedule: { timezone: "America/New_York" },
    });
    mocks.getRecipient.mockResolvedValue({
      recipientId: payload.recipientId,
      emailSnapshot: "lead@example.com",
      normalizedEmailSnapshot: "lead@example.com",
    });
    mocks.commitRecipientOutcome.mockResolvedValue(true);
  });

  it("renders a confirmation on GET without changing recipient state", async () => {
    const token = signUnsubscribeToken(payload);
    const response = await GET(
      new NextRequest(`https://cadence.example/api/u/${token}`),
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Stop emails from this sender?");
    expect(mocks.commitRecipientOutcome).not.toHaveBeenCalled();
    expect(mocks.cancelRecipientQueue).not.toHaveBeenCalled();
  });

  it("applies a confirmed RFC 8058 POST and cancels queued work", async () => {
    const token = signUnsubscribeToken(payload);
    const response = await POST(
      new NextRequest(`https://cadence.example/api/u/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.commitRecipientOutcome).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-1" },
      "campaign-1",
      "recipient-1",
      "UNSUBSCRIBE",
      expect.objectContaining({ status: "UNSUBSCRIBED" }),
      expect.any(String),
      { suppressionSource: "ONE_CLICK" }
    );
    expect(mocks.cancelRecipientQueue).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-1" },
      "campaign-1",
      "recipient-1"
    );
  });

  it("rejects POST bodies that do not carry the one-click confirmation", async () => {
    const token = signUnsubscribeToken(payload);
    const response = await POST(
      new NextRequest(`https://cadence.example/api/u/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "unexpected=value",
      }),
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.commitRecipientOutcome).not.toHaveBeenCalled();
  });
});

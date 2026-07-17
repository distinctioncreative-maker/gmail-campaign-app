import { describe, expect, it } from "vitest";
import { checkEligibility, type EligibilityInput } from "@/lib/campaigns/eligibility";

// Wed 2026-07-15 10:00 EDT.
const IN_WINDOW = Date.UTC(2026, 6, 15, 14);

function base(): EligibilityInput {
  return {
    campaign: {
      status: "ACTIVE",
      followupsPaused: false,
      schedule: {
        timezone: "America/New_York",
        allowedWeekdays: [1, 2, 3, 4, 5],
        startAt: null,
        sendWindowStart: "09:00",
        sendWindowEnd: "20:00",
        emailsPerBatch: 5,
        minDelaySeconds: 5,
        maxDelaySeconds: 10,
        interBatchDelayMinutes: 2,
        dailySendLimit: 100,
      },
    },
    recipient: {
      included: true,
      status: "SCHEDULED",
      repliedAt: null,
      bouncedAt: null,
      unsubscribedAt: null,
    },
    queueItem: { status: "PROCESSING", type: "SEND_INITIAL" },
    gmailConnected: true,
    suppressed: false,
    emailOptOut: false,
    idempotencyKeyUsed: false,
    now: IN_WINDOW,
    sentTodayCount: 0,
  };
}

describe("checkEligibility", () => {
  it("passes the happy path", () => {
    expect(checkEligibility(base())).toEqual({ eligible: true });
  });

  it("blocks when the queue item was not claimed (replay safety)", () => {
    const input = base();
    input.queueItem = { ...input.queueItem, status: "COMPLETE" };
    const r = checkEligibility(input);
    expect(r).toMatchObject({ eligible: false, reason: "QUEUE_ITEM_NOT_CLAIMED", retryable: false });
  });

  it("blocks a used idempotency key permanently", () => {
    const input = { ...base(), idempotencyKeyUsed: true };
    expect(checkEligibility(input)).toMatchObject({ eligible: false, reason: "ALREADY_SENT" });
  });

  it.each(["PAUSED", "STOPPED", "CANCELLED", "COMPLETED", "DRAFT"] as const)(
    "blocks when campaign is %s",
    (status) => {
      const input = base();
      input.campaign = { ...input.campaign, status };
      expect(checkEligibility(input)).toMatchObject({
        eligible: false,
        reason: `CAMPAIGN_${status}`,
        retryable: false,
      });
    }
  );

  it("blocks follow-ups when follow-ups are paused, but not initial sends", () => {
    const paused = base();
    paused.campaign = { ...paused.campaign, followupsPaused: true };
    paused.queueItem = { status: "PROCESSING", type: "SEND_FOLLOWUP" };
    expect(checkEligibility(paused)).toMatchObject({ eligible: false, reason: "FOLLOWUPS_PAUSED" });

    const initial = base();
    initial.campaign = { ...initial.campaign, followupsPaused: true };
    expect(checkEligibility(initial)).toEqual({ eligible: true });
  });

  it("blocks when Gmail is disconnected", () => {
    expect(checkEligibility({ ...base(), gmailConnected: false })).toMatchObject({
      eligible: false,
      reason: "GMAIL_NOT_CONNECTED",
    });
  });

  it("blocks replied / bounced / unsubscribed / suppressed / opted-out recipients", () => {
    for (const patch of [
      { repliedAt: 1 },
      { bouncedAt: 1 },
      { unsubscribedAt: 1 },
    ] as const) {
      const input = base();
      input.recipient = { ...input.recipient, ...patch };
      expect(checkEligibility(input).eligible).toBe(false);
    }
    expect(checkEligibility({ ...base(), suppressed: true }).eligible).toBe(false);
    expect(checkEligibility({ ...base(), emailOptOut: true }).eligible).toBe(false);
  });

  it("marks outside-window as retryable", () => {
    // 21:00 EDT same day.
    const input = { ...base(), now: Date.UTC(2026, 6, 16, 1) };
    expect(checkEligibility(input)).toMatchObject({
      eligible: false,
      reason: "OUTSIDE_SEND_WINDOW",
      retryable: true,
    });
  });

  it("marks daily-cap as retryable (daily limit rollover)", () => {
    const input = { ...base(), sentTodayCount: 100 };
    expect(checkEligibility(input)).toMatchObject({
      eligible: false,
      reason: "DAILY_LIMIT_REACHED",
      retryable: true,
    });
  });
});

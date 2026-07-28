import { describe, expect, it } from "vitest";
import { buildNextFollowupQueueItem } from "@/lib/campaigns/followups";
import {
  CLOUD_TASK_SCHEDULE_HORIZON_MS,
  isWithinTaskScheduleHorizon,
} from "@/lib/tasks/enqueue";
import type { Campaign } from "@/schemas/campaign";
import type { Sequence } from "@/schemas/sequence";

const completedAt = Date.UTC(2026, 6, 21, 14, 0);
const campaign = {
  campaignId: "campaign-1",
  ownerUserId: "user-1",
  organizationId: "org-1",
  sequenceId: "sequence-1",
  schedule: {
    timezone: "America/New_York",
    allowedWeekdays: [1, 2, 3, 4, 5],
    startAt: null,
    sendWindowStart: "09:00",
    sendWindowEnd: "17:00",
    emailsPerBatch: 5,
    minDelaySeconds: 30,
    maxDelaySeconds: 90,
    interBatchDelayMinutes: 2,
    dailySendLimit: 100,
  },
} as Campaign;
const sequence = {
  sequenceId: "sequence-1",
  active: true,
  steps: [
    {
      stepId: "step-1",
      delayValue: 60,
      delayUnit: "MINUTES",
      bodyMode: "SAME",
      templateId: null,
      customSubject: "",
      customHtml: "",
      subjectMode: "RE",
      sameThread: true,
      enabled: true,
    },
  ],
} as Sequence;

describe("durable follow-up outbox", () => {
  it("builds a deterministic next-step queue record from the confirmed send time", () => {
    const item = buildNextFollowupQueueItem(
      { userId: "user-1", organizationId: "org-1" },
      campaign,
      sequence,
      "recipient-1",
      0,
      completedAt
    );

    expect(item).toMatchObject({
      campaignId: "campaign-1",
      recipientId: "recipient-1",
      sequenceStep: 1,
      status: "SCHEDULED",
      cloudTaskName: null,
      scheduledAt: completedAt + 60 * 60 * 1000,
      idempotencyKey: "org-1:user-1:campaign-1:recipient-1:1",
    });
    expect(item?.queueItemId).toHaveLength(64);
  });

  it("does not create work for an inactive sequence or missing next step", () => {
    expect(
      buildNextFollowupQueueItem(
        { userId: "user-1", organizationId: "org-1" },
        campaign,
        { ...sequence, active: false },
        "recipient-1",
        0,
        completedAt
      )
    ).toBeNull();
    expect(
      buildNextFollowupQueueItem(
        { userId: "user-1", organizationId: "org-1" },
        campaign,
        sequence,
        "recipient-1",
        1,
        completedAt
      )
    ).toBeNull();
  });
});

describe("Cloud Tasks scheduling horizon", () => {
  it("keeps long-delay work durable until it enters the supported horizon", () => {
    expect(
      isWithinTaskScheduleHorizon(
        completedAt + CLOUD_TASK_SCHEDULE_HORIZON_MS,
        completedAt
      )
    ).toBe(true);
    expect(
      isWithinTaskScheduleHorizon(
        completedAt + CLOUD_TASK_SCHEDULE_HORIZON_MS + 1,
        completedAt
      )
    ).toBe(false);
  });
});

import "server-only";
import crypto from "node:crypto";
import type { Campaign, QueueItem } from "@/schemas/campaign";
import type { Sequence, SequenceStep } from "@/schemas/sequence";
import {
  updateQueueItem,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { addBusinessDays, nextValidTime } from "@/lib/scheduling/window";
import { enqueueTask } from "@/lib/tasks/enqueue";
import { idempotencyKey } from "@/lib/campaigns/idempotency";
import { queueTypeFor } from "@/lib/campaigns/queueType";

function stepDelayMs(step: SequenceStep, from: number, campaign: Campaign): number {
  switch (step.delayUnit) {
    case "MINUTES":
      return from + step.delayValue * 60_000;
    case "HOURS":
      return from + step.delayValue * 3_600_000;
    case "DAYS":
      return from + step.delayValue * 86_400_000;
    case "BUSINESS_DAYS":
      return addBusinessDays(from, step.delayValue, {
        timezone: campaign.schedule.timezone,
        allowedWeekdays: campaign.schedule.allowedWeekdays,
      });
  }
}

/** Build the durable queue record for the next enabled follow-up. The worker
 * commits this record atomically with the Gmail result; publishing the Cloud
 * Task is a separate, retryable projection. */
export function buildNextFollowupQueueItem(
  owner: OwnerRef,
  campaign: Campaign,
  sequence: Sequence | null,
  recipientId: string,
  completedStep: number,
  completedAt: number
): QueueItem | null {
  if (!campaign.sequenceId || !sequence || !sequence.active) return null;

  // steps[0] is follow-up #1 (sent after the initial email at step 0).
  const step = sequence.steps[completedStep];
  if (!step || !step.enabled) return null;

  const scheduledAt = nextValidTime(
    stepDelayMs(step, completedAt, campaign),
    campaign.schedule
  );
  const sequenceStep = completedStep + 1;
  const key = idempotencyKey(
    owner.organizationId,
    owner.userId,
    campaign.campaignId,
    recipientId,
    sequenceStep
  );
  const queueItemId = crypto.createHash("sha256").update(key).digest("hex");

  return {
    queueItemId,
    organizationId: owner.organizationId,
    ownerUserId: owner.userId,
    campaignId: campaign.campaignId,
    recipientId,
    type: queueTypeFor(campaign, "followup"),
    sequenceStep,
    scheduledAt,
    status: "SCHEDULED",
    attemptCount: 0,
    idempotencyKey: key,
    cloudTaskName: null,
    startedAt: null,
    completedAt: null,
    lastError: null,
    createdAt: completedAt,
    updatedAt: completedAt,
  };
}

/** Publish a queue record that is already durable. A null task name means the
 * item is beyond Cloud Tasks' 30-day horizon (or Tasks are not configured);
 * the repair sweep will publish it later. */
export async function publishFollowupQueueItem(
  owner: OwnerRef,
  item: QueueItem
): Promise<void> {
  const taskName = await enqueueTask(
    "send-message",
    {
      organizationId: owner.organizationId,
      ownerUserId: owner.userId,
      campaignId: item.campaignId,
      queueItemId: item.queueItemId,
    },
    item.scheduledAt
  );
  if (taskName) {
    await updateQueueItem(owner, item.campaignId, item.queueItemId, {
      cloudTaskName: taskName,
    });
  }
}

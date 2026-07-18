import "server-only";
import crypto from "node:crypto";
import type { Campaign } from "@/schemas/campaign";
import type { SequenceStep } from "@/schemas/sequence";
import {
  batchCreateQueueItems,
  updateRecipient,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { getSequence } from "@/lib/repositories/sequences";
import { addBusinessDays, nextValidTime } from "@/lib/scheduling/window";
import { enqueueTask } from "@/lib/tasks/enqueue";
import { idempotencyKey } from "@/lib/campaigns/idempotency";

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

/**
 * After a confirmed send at `completedStep`, schedule the next enabled
 * follow-up step for this recipient — computed only now (spec §15), rolled
 * into the send window, enqueued as its own Cloud Task. A campaign with no
 * sequence simply has no follow-up work.
 */
export async function scheduleNextFollowup(
  owner: OwnerRef,
  campaign: Campaign,
  recipientId: string,
  completedStep: number
): Promise<void> {
  if (!campaign.sequenceId || campaign.followupsPaused) return;

  const sequence = await getSequence(owner, campaign.sequenceId);
  if (!sequence || !sequence.active) return;

  // steps[0] is follow-up #1 (sent after the initial email at step 0).
  const step = sequence.steps[completedStep];
  if (!step || !step.enabled) return;

  const now = Date.now();
  const scheduledAt = nextValidTime(stepDelayMs(step, now, campaign), campaign.schedule);
  const sequenceStep = completedStep + 1;
  const queueItemId = crypto.randomUUID();

  await batchCreateQueueItems(owner, campaign.campaignId, [
    {
      queueItemId,
      organizationId: owner.organizationId,
      ownerUserId: owner.userId,
      campaignId: campaign.campaignId,
      recipientId,
      type: "SEND_FOLLOWUP",
      sequenceStep,
      scheduledAt,
      status: "SCHEDULED",
      attemptCount: 0,
      idempotencyKey: idempotencyKey(
        owner.organizationId,
        owner.userId,
        campaign.campaignId,
        recipientId,
        sequenceStep
      ),
      cloudTaskName: null,
      startedAt: null,
      completedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await updateRecipient(owner, campaign.campaignId, recipientId, {
    nextFollowupAt: scheduledAt,
  });

  await enqueueTask(
    "send-message",
    {
      organizationId: owner.organizationId,
      ownerUserId: owner.userId,
      campaignId: campaign.campaignId,
      queueItemId,
    },
    scheduledAt
  );
}

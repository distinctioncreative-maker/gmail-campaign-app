import "server-only";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { Campaign, QueueItem } from "@/schemas/campaign";
import {
  getCampaign,
  listQueueItems,
  ownerFromCtx,
  recordEvent,
  setCampaignStatus,
  updateCampaign,
  updateQueueItem,
  updateRecipient,
  getRecipient,
  createCampaign,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { computeSendTimestamps } from "@/lib/scheduling/window";
import { deleteTask, enqueueTask } from "@/lib/tasks/enqueue";
import { gmailForUser } from "@/lib/gmail/client";

const OPEN_STATUSES = ["PENDING", "SCHEDULED", "RETRY_SCHEDULED"] as const;

async function cancelOpenQueueItems(
  owner: OwnerRef,
  campaignId: string,
  toStatus: "CANCELLED" | "SKIPPED" = "CANCELLED"
): Promise<number> {
  const open = await listQueueItems(owner, campaignId, [...OPEN_STATUSES]);
  for (const item of open) {
    await updateQueueItem(owner, campaignId, item.queueItemId, { status: toStatus });
    if (item.cloudTaskName) await deleteTask(item.cloudTaskName);
  }
  return open.length;
}

export async function pauseCampaign(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  await setCampaignStatus(owner, campaign.campaignId, "PAUSED", { pausedAt: Date.now() });
  await recordEvent(owner, campaign.campaignId, {
    type: "PAUSED",
    message:
      "Campaign paused. An email already being sent this second may still go out; nothing else will.",
    severity: "INFO",
    recipientEmail: null,
  });
  return "Campaign paused.";
}

/** Resume: revalidate + re-space remaining sends from now, recreate tasks. */
export async function resumeCampaign(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const open = await listQueueItems(owner, campaign.campaignId, [...OPEN_STATUSES]);

  const now = Date.now();
  const times = computeSendTimestamps(now + 30_000, open.length, campaign.schedule);
  for (let i = 0; i < open.length; i++) {
    const item = open[i];
    await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
      status: "SCHEDULED",
      scheduledAt: times[i],
    });
    const taskName = await enqueueTask(
      "send-message",
      {
        organizationId: owner.organizationId,
        ownerUserId: owner.userId,
        campaignId: campaign.campaignId,
        queueItemId: item.queueItemId,
      },
      times[i]
    );
    if (taskName) {
      await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
        cloudTaskName: taskName,
      });
    }
  }

  await setCampaignStatus(owner, campaign.campaignId, "ACTIVE", { resumedAt: now });
  await recordEvent(owner, campaign.campaignId, {
    type: "RESUMED",
    message: `Campaign resumed — ${open.length} remaining emails rescheduled.`,
    severity: "INFO",
    recipientEmail: null,
  });
  return `Campaign resumed with ${open.length} emails remaining.`;
}

export async function stopCampaign(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const cancelled = await cancelOpenQueueItems(owner, campaign.campaignId);
  await setCampaignStatus(owner, campaign.campaignId, "STOPPED", { stoppedAt: Date.now() });
  await recordEvent(owner, campaign.campaignId, {
    type: "STOPPED",
    message: `Campaign stopped permanently. ${cancelled} unsent emails were cancelled; sent emails and drafts are untouched.`,
    severity: "INFO",
    recipientEmail: null,
  });
  return "Campaign stopped.";
}

export async function cancelRemaining(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const cancelled = await cancelOpenQueueItems(owner, campaign.campaignId);
  await setCampaignStatus(owner, campaign.campaignId, "CANCELLED", { stoppedAt: Date.now() });
  await recordEvent(owner, campaign.campaignId, {
    type: "CANCELLED",
    message: `${cancelled} remaining emails cancelled. Gmail drafts were kept.`,
    severity: "INFO",
    recipientEmail: null,
  });
  return `${cancelled} remaining emails cancelled.`;
}

export async function cancelAndDeleteDrafts(
  ctx: AuthContext,
  campaign: Campaign
): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const cancelled = await cancelOpenQueueItems(owner, campaign.campaignId);

  // Delete unsent Gmail drafts only (never sent messages).
  const { listRecipients } = await import("@/lib/repositories/campaigns");
  const recipients = await listRecipients(owner, campaign.campaignId);
  let deleted = 0;
  const gmail = await gmailForUser(ctx.userId).catch(() => null);
  if (gmail) {
    for (const r of recipients) {
      if (r.initialDraftId && !r.initialSentAt) {
        try {
          await gmail.users.drafts.delete({ userId: "me", id: r.initialDraftId });
          await updateRecipient(owner, campaign.campaignId, r.recipientId, {
            initialDraftId: null,
            status: "CANCELLED",
          });
          deleted++;
        } catch {
          // Draft already gone — fine.
        }
      }
    }
  }

  await setCampaignStatus(owner, campaign.campaignId, "CANCELLED", { stoppedAt: Date.now() });
  await recordEvent(owner, campaign.campaignId, {
    type: "CANCELLED_DRAFTS_DELETED",
    message: `${cancelled} remaining emails cancelled and ${deleted} unsent Gmail drafts deleted.`,
    severity: "INFO",
    recipientEmail: null,
  });
  return `Cancelled ${cancelled} emails and deleted ${deleted} drafts.`;
}

export async function sendNextBatchNow(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const open = await listQueueItems(owner, campaign.campaignId, [
    "SCHEDULED",
    "PENDING",
    "RETRY_SCHEDULED",
  ]);
  const perBatch = Math.max(1, campaign.schedule.emailsPerBatch);
  const batch = open.slice(0, perBatch);
  const rest = open.slice(perBatch);
  const now = Date.now();
  const spacingMs = Math.max(3, campaign.schedule.minDelaySeconds) * 1000;

  // Reschedule an item: cancel its old task, set the new time, enqueue a new
  // task. Used for both the immediate batch and the shifted remainder.
  const reschedule = async (item: QueueItem, at: number) => {
    if (item.cloudTaskName) await deleteTask(item.cloudTaskName);
    await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
      scheduledAt: at,
      status: "SCHEDULED",
    });
    const taskName = await enqueueTask(
      "send-message",
      {
        organizationId: owner.organizationId,
        ownerUserId: owner.userId,
        campaignId: campaign.campaignId,
        queueItemId: item.queueItemId,
      },
      at
    );
    if (taskName) {
      await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
        cloudTaskName: taskName,
      });
    }
  };

  // Send the next batch right away, spaced by the per-email delay.
  let lastBatchTime = now;
  for (let i = 0; i < batch.length; i++) {
    lastBatchTime = now + i * spacingMs;
    await reschedule(batch[i], lastBatchTime);
  }

  // Shift every remaining email so the following batches keep their pacing
  // (inter-batch gap + windows) starting after this batch, instead of firing
  // at their original times and bunching up.
  if (rest.length > 0) {
    const restStart = lastBatchTime + campaign.schedule.interBatchDelayMinutes * 60_000;
    const times = computeSendTimestamps(restStart, rest.length, campaign.schedule);
    for (let i = 0; i < rest.length; i++) {
      await reschedule(rest[i], times[i]);
    }
  }

  return rest.length > 0
    ? `Sending the next ${batch.length} now; ${rest.length} remaining emails were rescheduled to follow.`
    : `Sending the final ${batch.length} emails now.`;
}

export async function retryFailed(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const owner = ownerFromCtx(ctx);
  // Recover two situations: emails that errored while sending, and emails that
  // were scheduled but never actually enqueued (e.g. the sending service was
  // briefly misconfigured at launch, leaving them without a Cloud Task).
  const candidates = await listQueueItems(owner, campaign.campaignId, [
    "ERROR",
    "SCHEDULED",
    "RETRY_SCHEDULED",
  ]);
  const toRetry = candidates.filter((item) => item.status === "ERROR" || !item.cloudTaskName);

  // Re-space with the campaign's real pacing (batches, per-email delay,
  // inter-batch gap, send window) — not a flat interval — so a retry throttles
  // exactly like a fresh launch.
  const times = computeSendTimestamps(Date.now() + 30_000, toRetry.length, campaign.schedule);
  let requeued = 0;
  for (let i = 0; i < toRetry.length; i++) {
    const at = times[i];
    await updateQueueItem(owner, campaign.campaignId, toRetry[i].queueItemId, {
      status: "RETRY_SCHEDULED",
      scheduledAt: at,
      lastError: null,
    });
    const taskName = await enqueueTask(
      "send-message",
      {
        organizationId: owner.organizationId,
        ownerUserId: owner.userId,
        campaignId: campaign.campaignId,
        queueItemId: toRetry[i].queueItemId,
      },
      at
    );
    if (taskName) {
      await updateQueueItem(owner, campaign.campaignId, toRetry[i].queueItemId, {
        cloudTaskName: taskName,
      });
      requeued++;
    }
  }

  if (toRetry.length === 0) return "Nothing needs retrying — every email is already scheduled.";
  if (requeued < toRetry.length) {
    return `Re-scheduled ${requeued} of ${toRetry.length} emails. The sending service is still not reachable — check Cloud Tasks setup and try again.`;
  }
  return `Re-scheduled ${requeued} emails to send.`;
}

export async function skipRecipient(
  ctx: AuthContext,
  campaign: Campaign,
  recipientId: string
): Promise<string> {
  const owner = ownerFromCtx(ctx);
  const recipient = await getRecipient(owner, campaign.campaignId, recipientId);
  if (!recipient) return "That person is not in this campaign.";
  await updateRecipient(owner, campaign.campaignId, recipientId, {
    status: "SKIPPED",
    included: false,
    exclusionReason: "MANUALLY_SKIPPED",
  });
  const open = await listQueueItems(owner, campaign.campaignId, [...OPEN_STATUSES]);
  for (const item of open.filter((i) => i.recipientId === recipientId)) {
    await updateQueueItem(owner, campaign.campaignId, item.queueItemId, { status: "CANCELLED" });
    if (item.cloudTaskName) await deleteTask(item.cloudTaskName);
  }
  await recordEvent(owner, campaign.campaignId, {
    type: "RECIPIENT_SKIPPED",
    message: `${recipient.emailSnapshot} was removed from this campaign.`,
    severity: "INFO",
    recipientEmail: recipient.emailSnapshot,
  });
  return "Removed from this campaign.";
}

export async function toggleFollowups(
  ctx: AuthContext,
  campaign: Campaign,
  paused: boolean
): Promise<string> {
  const owner = ownerFromCtx(ctx);
  await updateCampaign(owner, campaign.campaignId, { followupsPaused: paused });
  await recordEvent(owner, campaign.campaignId, {
    type: paused ? "FOLLOWUPS_PAUSED" : "FOLLOWUPS_RESUMED",
    message: paused ? "Follow-ups paused." : "Follow-ups resumed.",
    severity: "INFO",
    recipientEmail: null,
  });
  return paused ? "Follow-ups paused." : "Follow-ups resumed.";
}

export async function cloneCampaign(ctx: AuthContext, campaign: Campaign): Promise<string> {
  const copy = await createCampaign(ctx, {
    name: `${campaign.name} (copy)`,
    description: campaign.description,
    status: "DRAFT",
    initialTemplateId: campaign.initialTemplateId,
    sequenceId: campaign.sequenceId,
    sourceType: campaign.sourceType,
    sourceReference: campaign.sourceReference,
    schedule: { ...campaign.schedule, startAt: null },
    gmailQuotaReserve: campaign.gmailQuotaReserve,
    priorContactPolicy: campaign.priorContactPolicy,
    priorContactExcludeDays: campaign.priorContactExcludeDays,
    draftStrategy: campaign.draftStrategy,
    totalRecipients: 0,
    eligibleRecipients: 0,
    excludedRecipients: 0,
    draftedCount: 0,
    sentCount: 0,
    replyCount: 0,
    bounceCount: 0,
    unsubscribeCount: 0,
    followupSentCount: 0,
    errorCount: 0,
    followupsPaused: false,
    startedAt: null,
    pausedAt: null,
    resumedAt: null,
    stoppedAt: null,
    completedAt: null,
  });
  return copy.campaignId;
}

export async function refreshCampaign(
  ctx: AuthContext,
  campaignId: string
): Promise<Campaign | null> {
  return getCampaign(ownerFromCtx(ctx), campaignId);
}

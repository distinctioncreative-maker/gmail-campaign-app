import "server-only";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import {
  claimDeferralForDay,
  listQueueItems,
  recordEvent,
  updateQueueItem,
} from "@/lib/repositories/campaigns";
import { enqueueTask } from "@/lib/tasks/enqueue";
import { computeSendTimestamps, localDayKey, nextValidTime } from "@/lib/scheduling/window";
import type { Campaign } from "@/schemas/campaign";

const OPEN = ["PENDING", "SCHEDULED", "RETRY_SCHEDULED"] as const;

/** First moment of the next calendar day (campaign timezone) that falls
 * inside the campaign's sending window. */
export function nextDayWindowStart(now: number, schedule: Campaign["schedule"]): number {
  const today = localDayKey(now, schedule.timezone);
  let t = now;
  while (localDayKey(t, schedule.timezone) === today) t += 15 * 60 * 1000;
  return nextValidTime(t, schedule);
}

/**
 * When the daily limit is hit, re-spread EVERY remaining queued email across
 * the next sending day using the campaign's own pacing (batches, delays,
 * gaps) — exactly like launch does. Without this, each blocked email lands
 * on the identical "window open" instant and the whole backlog blasts out
 * at once the next morning (the 9:00:0x stampede).
 *
 * Runs at most once per (campaign, day): the first blocked task wins the
 * claim and does the re-spread; every later one is a no-op.
 */
export async function deferCampaignToNextDay(
  owner: OwnerRef,
  campaign: Campaign
): Promise<{ deferred: number } | null> {
  const now = Date.now();
  const startAt = nextDayWindowStart(now, campaign.schedule);
  const dayKey = localDayKey(startAt, campaign.schedule.timezone);

  const won = await claimDeferralForDay(owner, campaign.campaignId, dayKey);
  if (!won) return null;

  const open = await listQueueItems(owner, campaign.campaignId, [...OPEN]);
  if (open.length === 0) return { deferred: 0 };

  const times = computeSendTimestamps(startAt, open.length, campaign.schedule);
  for (let i = 0; i < open.length; i++) {
    await updateQueueItem(owner, campaign.campaignId, open[i].queueItemId, {
      status: "SCHEDULED",
      scheduledAt: times[i],
      lastError: "DAILY_LIMIT_REACHED",
    });
    await enqueueTask(
      "send-message",
      {
        organizationId: owner.organizationId,
        ownerUserId: owner.userId,
        campaignId: campaign.campaignId,
        queueItemId: open[i].queueItemId,
      },
      times[i]
    );
  }

  await recordEvent(owner, campaign.campaignId, {
    type: "DAILY_LIMIT",
    message: `Daily limit reached — ${open.length} remaining email${open.length === 1 ? "" : "s"} rescheduled across tomorrow with your normal pacing.`,
    severity: "INFO",
    recipientEmail: null,
  });

  return { deferred: open.length };
}

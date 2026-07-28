import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import {
  listCampaigns,
  getIdempotencyStatus,
  listQueueItems,
  updateQueueItem,
} from "@/lib/repositories/campaigns";
import {
  CLOUD_TASK_SCHEDULE_HORIZON_MS,
  enqueueTask,
} from "@/lib/tasks/enqueue";

const STUCK_PROCESSING_MS = 15 * 60 * 1000;

/** List every user document (admin-only sweep enumeration). */
export async function listAllOwners(): Promise<OwnerRef[]> {
  const owners: OwnerRef[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  do {
    let query = firestore().collection("users").orderBy("__name__").limit(500);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    for (const doc of snap.docs) {
      const data = doc.data();
      owners.push({
        userId: doc.id,
        organizationId: (data.organizationId as string) ?? "default",
      });
    }
    cursor = snap.docs.at(-1) ?? null;
    if (snap.size < 500) break;
  } while (cursor);
  return owners;
}

/**
 * Repair stuck work. A PROCESSING item is requeued only when no delivery
 * reservation exists. Once a Gmail attempt may have started, it becomes
 * AMBIGUOUS instead of being retried and risking a duplicate.
 */
export async function repairOwner(
  owner: OwnerRef
): Promise<{ reset: number; requeued: number; ambiguous: number }> {
  const campaigns = (
    await listCampaigns(owner, Number.POSITIVE_INFINITY)
  ).filter((c) => c.status === "ACTIVE");
  let reset = 0;
  let requeued = 0;
  let ambiguous = 0;
  const now = Date.now();

  for (const campaign of campaigns) {
    const processing = await listQueueItems(owner, campaign.campaignId, ["PROCESSING"]);
    for (const item of processing) {
      if (item.startedAt && now - item.startedAt > STUCK_PROCESSING_MS) {
        const delivery = await getIdempotencyStatus(
          owner,
          campaign.campaignId,
          item.idempotencyKey
        );
        if (delivery) {
          await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
            status: delivery === "RESERVED" ? "AMBIGUOUS" : "COMPLETE",
            completedAt: delivery === "RESERVED" ? null : now,
            lastError:
              delivery === "RESERVED"
                ? "Delivery outcome is unknown; not retried to prevent a duplicate."
                : null,
          });
          if (delivery === "RESERVED") ambiguous++;
          continue;
        }
        await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
          status: "SCHEDULED",
          lastError: "Recovered from a stuck send.",
        });
        reset++;
      }
    }

    const scheduled = await listQueueItems(owner, campaign.campaignId, ["SCHEDULED"]);
    for (const item of scheduled) {
      const isPastDue = item.scheduledAt < now - 5 * 60 * 1000;
      const missingTaskWithinHorizon =
        !item.cloudTaskName &&
        item.scheduledAt <= now + CLOUD_TASK_SCHEDULE_HORIZON_MS;
      // Durable outbox records with no task are published once they enter the
      // 29-day horizon. Past-due items are re-enqueued even if a stale task
      // name remains; duplicate Tasks are harmless because claim is atomic.
      if (isPastDue || missingTaskWithinHorizon) {
        const taskName = await enqueueTask(
          "send-message",
          {
            organizationId: owner.organizationId,
            ownerUserId: owner.userId,
            campaignId: campaign.campaignId,
            queueItemId: item.queueItemId,
          },
          Math.max(item.scheduledAt, now + 30_000)
        );
        if (taskName) {
          await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
            cloudTaskName: taskName,
          });
          requeued++;
        }
      }
    }
  }

  return { reset, requeued, ambiguous };
}

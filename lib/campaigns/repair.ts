import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import {
  listCampaigns,
  listQueueItems,
  updateQueueItem,
} from "@/lib/repositories/campaigns";
import { enqueueTask } from "@/lib/tasks/enqueue";

const STUCK_PROCESSING_MS = 15 * 60 * 1000;

/** List every user document (admin-only sweep enumeration). */
export async function listAllOwners(): Promise<OwnerRef[]> {
  const snap = await firestore().collection("users").limit(1000).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return { userId: d.id, organizationId: (data.organizationId as string) ?? "default" };
  });
}

/**
 * Repair stuck work: PROCESSING items older than 15 min are reset to
 * SCHEDULED, and SCHEDULED items whose time has passed are re-enqueued.
 */
export async function repairOwner(owner: OwnerRef): Promise<{ reset: number; requeued: number }> {
  const campaigns = (await listCampaigns(owner)).filter((c) => c.status === "ACTIVE");
  let reset = 0;
  let requeued = 0;
  const now = Date.now();

  for (const campaign of campaigns) {
    const processing = await listQueueItems(owner, campaign.campaignId, ["PROCESSING"]);
    for (const item of processing) {
      if (item.startedAt && now - item.startedAt > STUCK_PROCESSING_MS) {
        await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
          status: "SCHEDULED",
          lastError: "Recovered from a stuck send.",
        });
        reset++;
      }
    }

    const scheduled = await listQueueItems(owner, campaign.campaignId, ["SCHEDULED"]);
    for (const item of scheduled) {
      // Past-due by > 5 min and no live task tracking → re-enqueue.
      if (item.scheduledAt < now - 5 * 60 * 1000) {
        await enqueueTask(
          "send-message",
          {
            organizationId: owner.organizationId,
            ownerUserId: owner.userId,
            campaignId: campaign.campaignId,
            queueItemId: item.queueItemId,
          },
          now + 30_000
        );
        requeued++;
      }
    }
  }

  return { reset, requeued };
}

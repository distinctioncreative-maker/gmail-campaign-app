import "server-only";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import { listCampaigns, listRecipients } from "@/lib/repositories/campaigns";
import { setContactEngagement } from "@/lib/repositories/contacts";
import { engagementFromRecipients, type RecipientEngagementRow } from "@/lib/leads/engagement";

/**
 * Recompute every contact's engagement fields (emails sent, replies back,
 * bounce/unsubscribe state, last outcome) from the recipient records on the
 * user's campaigns — the authoritative source. Runs as part of the manual
 * "Scan for replies" action so historical activity backfills too, not just
 * events caught live by the monitors.
 */
export async function reconcileContactEngagement(
  owner: OwnerRef
): Promise<{ contactsSynced: number }> {
  const campaigns = await listCampaigns(owner, 200);
  const rows: RecipientEngagementRow[] = [];
  const lists = await Promise.all(campaigns.map((c) => listRecipients(owner, c.campaignId)));
  for (const recipients of lists) {
    for (const r of recipients) {
      rows.push({
        contactId: r.contactId,
        initialSentAt: r.initialSentAt,
        lastSentAt: r.lastSentAt,
        currentStep: r.currentStep,
        repliedAt: r.repliedAt,
        bouncedAt: r.bouncedAt,
        unsubscribedAt: r.unsubscribedAt,
        bounceType: r.bounceType ?? null,
      });
    }
  }

  const engagement = engagementFromRecipients(rows);
  let contactsSynced = 0;
  // Bounded parallelism: contacts are independent docs.
  const entries = [...engagement.entries()];
  for (let i = 0; i < entries.length; i += 25) {
    await Promise.all(
      entries.slice(i, i + 25).map(async ([contactId, e]) => {
        await setContactEngagement(owner, contactId, e);
        contactsSynced++;
      })
    );
  }
  return { contactsSynced };
}

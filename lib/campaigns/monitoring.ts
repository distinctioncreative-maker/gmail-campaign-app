import "server-only";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import {
  incrementCampaignCounters,
  listCampaigns,
  listQueueItems,
  listRecipients,
  recordEvent,
  updateQueueItem,
  updateRecipient,
} from "@/lib/repositories/campaigns";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { addSuppression } from "@/lib/repositories/suppressions";
import { addNotification } from "@/lib/repositories/notifications";
import { getInboundAfter, findRecentBounces } from "@/lib/gmail/threads";
import { classifyInboundMessage, parseReturnDate } from "@/lib/gmail/classifyReply";
import { classifyBounce, parseFailedRecipient } from "@/lib/gmail/classifyBounce";
import { getSequence } from "@/lib/repositories/sequences";
import { addBusinessDays } from "@/lib/scheduling/window";
import type { Recipient } from "@/schemas/campaign";

const MONITOR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const OPEN = ["PENDING", "SCHEDULED", "RETRY_SCHEDULED"] as const;

/** Cancel all pending/scheduled follow-up work for one recipient. */
async function cancelRecipientQueue(owner: OwnerRef, campaignId: string, recipientId: string): Promise<void> {
  const open = await listQueueItems(owner, campaignId, [...OPEN]);
  for (const item of open.filter((i) => i.recipientId === recipientId)) {
    await updateQueueItem(owner, campaignId, item.queueItemId, { status: "CANCELLED" });
  }
}

function isMonitorable(r: Recipient): boolean {
  return (
    r.included &&
    r.initialSentAt !== null &&
    Date.now() - r.initialSentAt < MONITOR_WINDOW_MS &&
    r.repliedAt === null &&
    r.bouncedAt === null &&
    r.unsubscribedAt === null &&
    r.gmailThreadId !== null
  );
}

/**
 * Scan a user's active campaigns for replies. For each monitorable
 * recipient, read the thread and act on inbound messages (spec §16).
 */
export async function processRepliesForUser(owner: OwnerRef): Promise<{ checked: number; replied: number }> {
  const connection = await getConnection(owner.userId);
  if (!connection || connection.status !== "CONNECTED") return { checked: 0, replied: 0 };

  const campaigns = (await listCampaigns(owner)).filter((c) =>
    ["ACTIVE", "PAUSED", "COMPLETED"].includes(c.status)
  );

  let checked = 0;
  let replied = 0;

  for (const campaign of campaigns) {
    const recipients = (await listRecipients(owner, campaign.campaignId)).filter(isMonitorable);
    for (const r of recipients) {
      checked++;
      let result;
      try {
        result = await getInboundAfter(
          owner.userId,
          r.gmailThreadId!,
          r.lastSentAt ?? r.initialSentAt!,
          connection.connectedEmail
        );
      } catch {
        continue; // token/thread issue — try again next sweep
      }
      if (result.inbound.length === 0) continue;

      // Classify the most relevant inbound message.
      const classes = result.inbound.map(classifyInboundMessage);
      const now = Date.now();

      if (classes.includes("UNSUBSCRIBE")) {
        await updateRecipient(owner, campaign.campaignId, r.recipientId, {
          status: "UNSUBSCRIBED",
          unsubscribedAt: now,
        });
        await cancelRecipientQueue(owner, campaign.campaignId, r.recipientId);
        await addSuppression(owner, {
          email: r.emailSnapshot,
          normalizedEmail: r.normalizedEmailSnapshot,
          reason: "UNSUBSCRIBED",
          scope: "USER",
          source: "REPLY_MONITOR",
          campaignId: campaign.campaignId,
          recipientId: r.recipientId,
        });
        await incrementCampaignCounters(owner, campaign.campaignId, { unsubscribeCount: 1 });
        await recordEvent(owner, campaign.campaignId, {
          type: "UNSUBSCRIBE",
          message: `${r.emailSnapshot} asked to unsubscribe — added to your do-not-email list.`,
          severity: "WARNING",
          recipientEmail: r.emailSnapshot,
        });
        await addNotification(owner, {
          type: "UNSUBSCRIBE",
          title: "Unsubscribe received",
          body: `${r.emailSnapshot} opted out and was added to your do-not-email list.`,
          severity: "WARNING",
          campaignId: campaign.campaignId,
        });
        replied++;
        continue;
      }

      if (classes.includes("OUT_OF_OFFICE")) {
        const sequence = campaign.sequenceId ? await getSequence(owner, campaign.sequenceId) : null;
        if (sequence?.outOfOfficePolicy === "STOP") {
          await cancelRecipientQueue(owner, campaign.campaignId, r.recipientId);
        } else if (!sequence || sequence.outOfOfficePolicy === "PAUSE_DAYS") {
          const oooBody = result.inbound.find((_m, i) => classes[i] === "OUT_OF_OFFICE")?.bodyText ?? "";
          const returnDate =
            parseReturnDate(oooBody) ??
            addBusinessDays(now, sequence?.outOfOfficePauseDays ?? 3, {
              timezone: campaign.schedule.timezone,
              allowedWeekdays: campaign.schedule.allowedWeekdays,
            });
          await updateRecipient(owner, campaign.campaignId, r.recipientId, {
            nextFollowupAt: returnDate,
          });
        }
        // OOO is not a human reply — do not stop the sequence outright.
        continue;
      }

      if (classes.includes("HUMAN_REPLY") || classes.includes("NOT_INTERESTED")) {
        await updateRecipient(owner, campaign.campaignId, r.recipientId, {
          status: "REPLIED",
          repliedAt: now,
        });
        await cancelRecipientQueue(owner, campaign.campaignId, r.recipientId);
        await incrementCampaignCounters(owner, campaign.campaignId, { replyCount: 1 });
        await recordEvent(owner, campaign.campaignId, {
          type: "REPLY",
          message: `${r.emailSnapshot} replied — follow-ups stopped.`,
          severity: "INFO",
          recipientEmail: r.emailSnapshot,
        });
        await addNotification(owner, {
          type: "REPLY",
          title: "New reply",
          body: `${r.emailSnapshot} replied to your campaign "${campaign.name}".`,
          severity: "SUCCESS",
          campaignId: campaign.campaignId,
        });
        replied++;
      }
    }
  }

  return { checked, replied };
}

/**
 * Scan the mailbox for delivery failures and mark matching recipients as
 * bounced (spec §17).
 */
export async function processBouncesForUser(owner: OwnerRef): Promise<{ bounces: number }> {
  const connection = await getConnection(owner.userId);
  if (!connection || connection.status !== "CONNECTED") return { bounces: 0 };

  let bounceMessages;
  try {
    bounceMessages = await findRecentBounces(owner.userId, connection.connectedEmail);
  } catch {
    return { bounces: 0 };
  }
  if (bounceMessages.length === 0) return { bounces: 0 };

  const campaigns = (await listCampaigns(owner)).filter((c) =>
    ["ACTIVE", "PAUSED", "COMPLETED"].includes(c.status)
  );

  // Build an index of monitorable recipients by normalized email.
  const byEmail = new Map<string, { campaignId: string; recipient: Recipient }>();
  for (const campaign of campaigns) {
    for (const r of await listRecipients(owner, campaign.campaignId)) {
      if (r.bouncedAt === null && r.initialSentAt !== null) {
        byEmail.set(r.normalizedEmailSnapshot, { campaignId: campaign.campaignId, recipient: r });
      }
    }
  }

  let bounces = 0;
  for (const msg of bounceMessages) {
    const failed = parseFailedRecipient(msg.bodyText);
    if (!failed) continue;
    const match = byEmail.get(failed.toLowerCase());
    if (!match) continue;

    const type = classifyBounce(msg);
    const now = Date.now();
    await updateRecipient(owner, match.campaignId, match.recipient.recipientId, {
      status: "BOUNCED",
      bounceType: type,
      bouncedAt: now,
    });

    if (type === "HARD") {
      const open = await listQueueItems(owner, match.campaignId, [...OPEN]);
      for (const item of open.filter((i) => i.recipientId === match.recipient.recipientId)) {
        await updateQueueItem(owner, match.campaignId, item.queueItemId, { status: "CANCELLED" });
      }
      await addSuppression(owner, {
        email: match.recipient.emailSnapshot,
        normalizedEmail: match.recipient.normalizedEmailSnapshot,
        reason: "HARD_BOUNCE",
        scope: "USER",
        source: "BOUNCE_MONITOR",
        campaignId: match.campaignId,
        recipientId: match.recipient.recipientId,
      });
    }

    await incrementCampaignCounters(owner, match.campaignId, { bounceCount: 1 });
    await recordEvent(owner, match.campaignId, {
      type: "BOUNCE",
      message: `${match.recipient.emailSnapshot} ${type === "HARD" ? "hard-bounced — added to your do-not-email list" : "soft-bounced"}.`,
      severity: "WARNING",
      recipientEmail: match.recipient.emailSnapshot,
    });
    bounces++;
    byEmail.delete(failed.toLowerCase());
  }

  return { bounces };
}

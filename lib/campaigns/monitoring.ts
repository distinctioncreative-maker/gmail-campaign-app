import "server-only";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import {
  incrementCampaignCounters,
  incrementDailyActivity,
  listCampaigns,
  listQueueItems,
  listRecipients,
  recordEvent,
  updateQueueItem,
  updateRecipient,
} from "@/lib/repositories/campaigns";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { recordEngagementByEmail } from "@/lib/repositories/contacts";
import { addSuppression } from "@/lib/repositories/suppressions";
import { addNotification } from "@/lib/repositories/notifications";
import {
  getInboundAfter,
  findRecentBounces,
  listRecentInbound,
  getMessageAsInbound,
} from "@/lib/gmail/threads";
import {
  classifyInboundMessage,
  detectPositiveIntent,
  parseReturnDate,
  stripQuotedText,
  type InboundMessage,
  type ReplyClass,
} from "@/lib/gmail/classifyReply";
import { classifyBounce, parseFailedRecipient } from "@/lib/gmail/classifyBounce";
import { getSequence } from "@/lib/repositories/sequences";
import { addBusinessDays, localDayKey } from "@/lib/scheduling/window";
import { mapWithConcurrency } from "@/lib/util/pool";
import type { Campaign, Recipient } from "@/schemas/campaign";

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

/** Campaign states worth scanning for replies — includes STOPPED so a
 * reply to a campaign you halted still gets counted. */
const REPLY_MONITOR_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "STOPPED"];

/** Gmail API fan-out concurrency for the scan. */
const SCAN_CONCURRENCY = 8;

/**
 * Apply the outcome of classified inbound mail for one recipient.
 * Returns true when the recipient was resolved (replied/unsubscribed).
 */
async function actOnInbound(
  owner: OwnerRef,
  campaign: Campaign,
  r: Recipient,
  classes: ReplyClass[],
  inbound: InboundMessage[]
): Promise<boolean> {
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
    await incrementDailyActivity(owner, localDayKey(now, campaign.schedule.timezone), "unsubscribes");
    await recordEngagementByEmail(owner, r.normalizedEmailSnapshot, "UNSUBSCRIBED", now);
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
    return true;
  }

  if (classes.includes("OUT_OF_OFFICE")) {
    const sequence = campaign.sequenceId ? await getSequence(owner, campaign.sequenceId) : null;
    if (sequence?.outOfOfficePolicy === "STOP") {
      await cancelRecipientQueue(owner, campaign.campaignId, r.recipientId);
    } else if (!sequence || sequence.outOfOfficePolicy === "PAUSE_DAYS") {
      const oooBody = inbound.find((_m, i) => classes[i] === "OUT_OF_OFFICE")?.bodyText ?? "";
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
    return false;
  }

  if (classes.includes("HUMAN_REPLY") || classes.includes("NOT_INTERESTED")) {
    // Pull the message that actually triggered this, for triage + reply drafts.
    const idx = classes.findIndex((c) => c === "HUMAN_REPLY" || c === "NOT_INTERESTED");
    const msg = idx >= 0 ? inbound[idx] : inbound[inbound.length - 1];
    const fresh = stripQuotedText(msg?.bodyText || msg?.snippet || "");
    const notInterested = classes.includes("NOT_INTERESTED");
    const replyIntent = notInterested
      ? "NOT_INTERESTED"
      : detectPositiveIntent(fresh)
        ? "INTERESTED"
        : "REPLIED";

    await updateRecipient(owner, campaign.campaignId, r.recipientId, {
      status: "REPLIED",
      repliedAt: now,
      replyIntent,
      lastReplySnippet: fresh.slice(0, 280),
    });
    await cancelRecipientQueue(owner, campaign.campaignId, r.recipientId);
    await incrementCampaignCounters(owner, campaign.campaignId, { replyCount: 1 });
    await incrementDailyActivity(owner, localDayKey(now, campaign.schedule.timezone), "replies");
    await recordEngagementByEmail(owner, r.normalizedEmailSnapshot, "REPLIED", now);
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
    return true;
  }

  return false;
}

/**
 * Scan a user's campaigns for replies (spec §16). Two passes:
 * 1. Thread pass — read each monitorable recipient's thread, in parallel.
 * 2. Inbox sweep — match recent inbox senders against still-unreplied
 *    recipients, so replies composed as NEW emails (not in-thread) are
 *    caught too.
 */
export async function processRepliesForUser(owner: OwnerRef): Promise<{ checked: number; replied: number }> {
  const connection = await getConnection(owner.userId);
  if (!connection || connection.status !== "CONNECTED") return { checked: 0, replied: 0 };

  const campaigns = (await listCampaigns(owner)).filter((c) =>
    REPLY_MONITOR_STATUSES.includes(c.status)
  );

  // Collect all monitorable recipients up front (recipient lists in parallel).
  const lists = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      recipients: (await listRecipients(owner, campaign.campaignId)).filter(isMonitorable),
    }))
  );
  const targets = lists.flatMap(({ campaign, recipients }) =>
    recipients.map((r) => ({ campaign, r }))
  );

  let replied = 0;
  const resolved = new Set<string>(); // recipientIds handled in pass 1

  // Pass 1: same-thread inbound, bounded-parallel.
  await mapWithConcurrency(targets, SCAN_CONCURRENCY, async ({ campaign, r }) => {
    let result;
    try {
      result = await getInboundAfter(
        owner.userId,
        r.gmailThreadId!,
        r.lastSentAt ?? r.initialSentAt!,
        connection.connectedEmail
      );
    } catch {
      return; // token/thread issue — try again next sweep
    }
    if (result.inbound.length === 0) return;
    const classes = result.inbound.map(classifyInboundMessage);
    if (await actOnInbound(owner, campaign, r, classes, result.inbound)) {
      resolved.add(r.recipientId);
      replied++;
    }
  });

  // Pass 2: inbox sweep for replies sent as brand-new emails.
  const pending = new Map(
    targets
      .filter(({ r }) => !resolved.has(r.recipientId))
      .map((t) => [t.r.normalizedEmailSnapshot, t] as const)
  );
  if (pending.size > 0) {
    let inboxRefs: Awaited<ReturnType<typeof listRecentInbound>> = [];
    try {
      inboxRefs = await listRecentInbound(owner.userId);
    } catch {
      // Inbox listing failed — thread-pass results still stand.
    }
    const matches = inboxRefs.filter((m) => {
      const t = pending.get(m.fromEmail);
      return t !== undefined && m.internalDate > (t.r.lastSentAt ?? t.r.initialSentAt ?? 0);
    });
    for (const m of matches.slice(0, 30)) {
      const t = pending.get(m.fromEmail);
      if (!t) continue;
      try {
        const inbound = await getMessageAsInbound(owner.userId, m.messageId);
        const classes = [classifyInboundMessage(inbound)];
        if (await actOnInbound(owner, t.campaign, t.r, classes, [inbound])) {
          replied++;
          pending.delete(m.fromEmail);
        }
      } catch {
        // Skip this message; the next sweep will retry.
      }
    }
  }

  return { checked: targets.length, replied };
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
    REPLY_MONITOR_STATUSES.includes(c.status)
  );

  // Build an index of monitorable recipients by normalized email.
  const byEmail = new Map<string, { campaignId: string; recipient: Recipient }>();
  const recipientLists = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaignId: campaign.campaignId,
      recipients: await listRecipients(owner, campaign.campaignId),
    }))
  );
  for (const { campaignId, recipients } of recipientLists) {
    for (const r of recipients) {
      if (r.bouncedAt === null && r.initialSentAt !== null) {
        byEmail.set(r.normalizedEmailSnapshot, { campaignId, recipient: r });
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
    const bouncedCampaign = campaigns.find((c) => c.campaignId === match.campaignId);
    await incrementDailyActivity(
      owner,
      localDayKey(now, bouncedCampaign?.schedule.timezone ?? "America/New_York"),
      "bounces"
    );
    await recordEngagementByEmail(
      owner,
      match.recipient.normalizedEmailSnapshot,
      type === "HARD" ? "BOUNCED_HARD" : "BOUNCED_SOFT",
      now
    );
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

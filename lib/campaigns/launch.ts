import "server-only";
import crypto from "node:crypto";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { Campaign, QueueItem, Recipient } from "@/schemas/campaign";
import { getContact } from "@/lib/repositories/contacts";
import { classifyLead } from "@/lib/leads/classify";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getTemplate } from "@/lib/repositories/templates";
import { listPlaceholders } from "@/lib/personalization/render";
import { computeSendTimestamps } from "@/lib/scheduling/window";
import {
  batchCreateQueueItems,
  batchCreateRecipients,
  ownerFromCtx,
  recordEvent,
  setCampaignStatus,
  updateQueueItem,
} from "@/lib/repositories/campaigns";
import { enqueueTask, tasksConfigured } from "@/lib/tasks/enqueue";
import { checkCollision } from "@/lib/campaigns/collision";
import { firestore } from "@/lib/firebase/admin";

export function idempotencyKey(
  organizationId: string,
  userId: string,
  campaignId: string,
  recipientId: string,
  step: number
): string {
  return `${organizationId}:${userId}:${campaignId}:${recipientId}:${step}`;
}

export interface LaunchValidation {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

/** Pre-launch validation (spec §12 step 7 + §14 preconditions). */
export async function validateForLaunch(
  ctx: AuthContext,
  campaign: Campaign
): Promise<LaunchValidation> {
  const problems: string[] = [];
  const warnings: string[] = [];

  const connection = await getConnection(ctx.userId);
  if (!connection || connection.status !== "CONNECTED") {
    problems.push("Gmail is not connected. Connect it in Settings first.");
  }

  if (!campaign.initialTemplateId) {
    problems.push("Choose an email template.");
  } else {
    const template = await getTemplate(ctx, campaign.initialTemplateId);
    if (!template || !template.active) {
      problems.push("The selected template no longer exists.");
    } else {
      const profile = await getSenderProfile(ctx);
      if (!profile.physicalAddress.trim()) {
        problems.push("Add your company mailing address in Settings — required for commercial email.");
      }
      if (!profile.unsubscribeText.trim()) {
        problems.push("Add an opt-out sentence in Settings — required for commercial email.");
      }
      const used = new Set([
        ...listPlaceholders(template.subjectTemplate),
        ...listPlaceholders(template.htmlTemplate),
      ]);
      if (!used.has("unsubscribe_text")) {
        warnings.push(
          "The template does not include {{unsubscribe_text}} — recipients won't see an opt-out line."
        );
      }
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}

export interface PreparedRecipient {
  contactId: string;
  included: boolean;
  exclusionReason: string | null;
  warning: boolean;
  overrideReason: string | null;
}

/**
 * Build recipient snapshots + queue items + Cloud Tasks for launch.
 * Re-classifies every contact at launch time (spec §10: import-time
 * classification is never trusted at launch).
 */
export async function launchCampaign(
  ctx: AuthContext,
  campaign: Campaign,
  selections: PreparedRecipient[],
  startNow: boolean
): Promise<{ eligible: number; excluded: number }> {
  const owner = ownerFromCtx(ctx);
  const now = Date.now();

  const recipients: Recipient[] = [];
  const contactCampaignCounts = new Map<string, number>();
  let excluded = 0;

  for (const sel of selections) {
    const contact = await getContact(ctx, sel.contactId);
    if (!contact) continue;
    contactCampaignCounts.set(contact.contactId, contact.campaignCount);

    const { classification } = await classifyLead(ctx, {
      email: contact.email,
      emailValid: true,
      emailOptOut: contact.emailOptOut,
    });

    // Hard exclusions can never be overridden by the client selection.
    const hardBlocked = ["EMAIL_OPT_OUT", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "INVALID"].includes(
      classification
    );

    let included = sel.included && !hardBlocked;
    let exclusionReason = sel.exclusionReason;
    if (hardBlocked) {
      exclusionReason = classification;
    } else if (included && classification === "CONTACTED_BEFORE") {
      // Prior-contact policy enforcement.
      if (campaign.priorContactPolicy === "ONLY_NEW") {
        included = false;
        exclusionReason = "CONTACTED_BEFORE";
      } else if (
        campaign.priorContactPolicy === "EXCLUDE_RECENT" &&
        contact.lastCampaignAt !== null &&
        now - contact.lastCampaignAt < campaign.priorContactExcludeDays * 24 * 60 * 60 * 1000
      ) {
        included = false;
        exclusionReason = "CONTACTED_RECENTLY";
      } else if (!sel.overrideReason && campaign.priorContactPolicy === "INCLUDE_AFTER_WARNING") {
        // Explicit user inclusion (sel.included) counts as the warning ack.
      }
    } else if (included && classification === "REPLIED_BEFORE") {
      if (campaign.priorContactPolicy !== "INCLUDE_AFTER_WARNING" || !sel.overrideReason) {
        included = false;
        exclusionReason = "REPLIED_BEFORE";
      }
    }

    // Team collision (privacy-preserving; no-op when policy is OFF).
    let teamCollisionWarning = false;
    if (included) {
      const collision = await checkCollision(
        ctx.organizationId,
        ctx.userId,
        contact.normalizedEmail,
        false
      );
      teamCollisionWarning = collision.collision;
      if (collision.block) {
        included = false;
        exclusionReason = "TEAM_COLLISION";
      }
    }

    if (!included) excluded++;

    recipients.push({
      recipientId: crypto.randomUUID(),
      campaignId: campaign.campaignId,
      contactId: contact.contactId,
      ownerUserId: ctx.userId,
      organizationId: ctx.organizationId,
      firstNameSnapshot: contact.firstName,
      fullNameSnapshot: contact.fullName,
      businessNameSnapshot: contact.businessName,
      emailSnapshot: contact.email,
      normalizedEmailSnapshot: contact.normalizedEmail,
      phoneSnapshot: contact.phone,
      sourceRecordIdSnapshot: contact.sourceRecordId,
      priorCampaignCount: contact.campaignCount,
      priorCampaignWarning: classification === "CONTACTED_BEFORE" || classification === "REPLIED_BEFORE",
      teamCollisionWarning,
      included,
      exclusionReason,
      overrideReason: sel.overrideReason,
      currentStep: 0,
      status: included ? "SCHEDULED" : "EXCLUDED",
      initialDraftId: null,
      initialMessageId: null,
      gmailThreadId: null,
      initialScheduledAt: null,
      initialSentAt: null,
      lastSentAt: null,
      repliedAt: null,
      bounceType: null,
      bouncedAt: null,
      unsubscribedAt: null,
      nextFollowupAt: null,
      lastError: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const eligibleRecipients = recipients.filter((r) => r.included);
  const startAt = startNow ? now : (campaign.schedule.startAt ?? now);
  const timestamps = computeSendTimestamps(startAt, eligibleRecipients.length, campaign.schedule);

  const queueItems: QueueItem[] = eligibleRecipients.map((recipient, i) => {
    recipient.initialScheduledAt = timestamps[i];
    return {
      queueItemId: crypto.randomUUID(),
      organizationId: ctx.organizationId,
      ownerUserId: ctx.userId,
      campaignId: campaign.campaignId,
      recipientId: recipient.recipientId,
      type: campaign.draftStrategy === "DRAFT_ONLY" ? "CREATE_INITIAL_DRAFT" : "SEND_INITIAL",
      sequenceStep: 0,
      scheduledAt: timestamps[i],
      status: "SCHEDULED",
      attemptCount: 0,
      idempotencyKey: idempotencyKey(
        ctx.organizationId,
        ctx.userId,
        campaign.campaignId,
        recipient.recipientId,
        0
      ),
      cloudTaskName: null,
      startedAt: null,
      completedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
  });

  await batchCreateRecipients(owner, campaign.campaignId, recipients);
  await batchCreateQueueItems(owner, campaign.campaignId, queueItems);

  // Update contact campaign history right away (drives prior-contact
  // detection for future imports even before sends complete).
  const db = firestore();
  for (let i = 0; i < eligibleRecipients.length; i += 450) {
    const batch = db.batch();
    for (const r of eligibleRecipients.slice(i, i + 450)) {
      batch.update(
        db.collection("users").doc(ctx.userId).collection("contacts").doc(r.contactId),
        {
          campaignCount: (contactCampaignCounts.get(r.contactId) ?? 0) + 1,
          lastCampaignId: campaign.campaignId,
          lastCampaignName: campaign.name,
          lastCampaignAt: now,
          updatedAt: now,
        }
      );
    }
    await batch.commit();
  }

  // Enqueue one Cloud Task per email. A failure here (e.g. queue not yet
  // provisioned) must not abort the launch after we've written recipients and
  // queue items — the items stay SCHEDULED and the repair sweep / manual retry
  // re-enqueues them. We record the failure so it's visible instead of a 500.
  let enqueueFailures = 0;
  for (const item of queueItems) {
    try {
      const taskName = await enqueueTask(
        "send-message",
        {
          organizationId: ctx.organizationId,
          ownerUserId: ctx.userId,
          campaignId: campaign.campaignId,
          queueItemId: item.queueItemId,
        },
        item.scheduledAt
      );
      if (taskName) {
        await updateQueueItem(owner, campaign.campaignId, item.queueItemId, {
          cloudTaskName: taskName,
        });
      }
    } catch (err) {
      enqueueFailures++;
      console.error("[launch] enqueue failed", {
        campaignId: campaign.campaignId,
        queueItemId: item.queueItemId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await setCampaignStatus(owner, campaign.campaignId, "ACTIVE", {
    totalRecipients: recipients.length,
    eligibleRecipients: eligibleRecipients.length,
    excludedRecipients: excluded,
    startedAt: now,
  });

  const launchMessage = !tasksConfigured()
    ? `Campaign created with ${eligibleRecipients.length} recipients, but background sending is not configured yet — an administrator must set up Cloud Tasks.`
    : enqueueFailures > 0
      ? `Campaign started, but ${enqueueFailures} of ${eligibleRecipients.length} emails could not be scheduled with the sending service. Use “Retry failed” once it's fixed — nothing was lost.`
      : `Campaign started: ${eligibleRecipients.length} emails scheduled, ${excluded} excluded for safety.`;
  await recordEvent(owner, campaign.campaignId, {
    type: "LAUNCHED",
    message: launchMessage,
    severity: !tasksConfigured() || enqueueFailures > 0 ? "WARNING" : "INFO",
    recipientEmail: null,
  });

  return { eligible: eligibleRecipients.length, excluded };
}

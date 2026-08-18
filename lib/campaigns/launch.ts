import "server-only";
import crypto from "node:crypto";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { Campaign, QueueItem, Recipient } from "@/schemas/campaign";
import { getContact } from "@/lib/repositories/contacts";
import { classifyLead } from "@/lib/leads/classify";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getTemplate } from "@/lib/repositories/templates";
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
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { generateOpener } from "@/lib/ai/generateOpener";
import { lookupBusinessByDomain, lookupDomainFor } from "@/lib/enrichment/businessLookup";
import { aiWritingEnabled } from "@/lib/ai/enabled";
import { mapWithConcurrency } from "@/lib/util/pool";
import { idempotencyKey } from "@/lib/campaigns/idempotency";
import { missingCommercialEmailPlaceholders } from "@/lib/campaigns/compliance";

/** Safety caps for per-lead AI personalization at launch. */
const MAX_PERSONALIZED = 150;
const PERSONALIZE_CONCURRENCY = 3;
/**
 * Website lookups run wider than opener generation. Openers are limited by our
 * own AI provider's rate limit, which is shared across the workspace; lookups
 * are limited by other people's web servers, one request each, so the binding
 * constraint is latency rather than quota.
 */
const LOOKUP_CONCURRENCY = 6;

function stableDocumentId(kind: "recipient" | "queue", ...parts: string[]): string {
  return `${kind}_${crypto.createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 40)}`;
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
        problems.push("Add your company mailing address in Settings: required for commercial email.");
      }
      if (!profile.unsubscribeText.trim()) {
        problems.push("Add an opt-out sentence in Settings: required for commercial email.");
      }
      const missing = missingCommercialEmailPlaceholders(template.htmlTemplate);
      if (missing.length > 0) {
        problems.push(
          `The template "${template.name}" must include ${missing
            .map((placeholder) => `{{${placeholder}}}`)
            .join(" and ")} in its message body.`
        );
      }
    }
  }

  // A/B rotation: every rotation template must still resolve.
  if (campaign.templateRotation.length > 1) {
    const resolved = await Promise.all(
      campaign.templateRotation.map((id) => getTemplate(ctx, id))
    );
    if (resolved.some((t) => !t || !t.active)) {
      problems.push("One of the rotation templates no longer exists: re-check your template selection.");
    }
    for (const template of resolved) {
      if (
        !template ||
        !template.active ||
        template.templateId === campaign.initialTemplateId
      ) {
        continue;
      }
      const missing = missingCommercialEmailPlaceholders(template.htmlTemplate);
      if (missing.length > 0) {
        problems.push(
          `The rotation template "${template.name}" must include ${missing
            .map((placeholder) => `{{${placeholder}}}`)
            .join(" and ")} in its message body.`
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
  startNow: boolean,
  personalize = false
): Promise<{ eligible: number; excluded: number }> {
  const owner = ownerFromCtx(ctx);
  const now = Date.now();

  const recipients: Recipient[] = [];
  let excluded = 0;

  // A caller may accidentally submit the same contact more than once. Keep the
  // final explicit choice, then use deterministic document IDs so a safe
  // pre-activation retry overwrites the same records instead of duplicating.
  const uniqueSelections = [...new Map(selections.map((s) => [s.contactId, s])).values()];

  for (const sel of uniqueSelections) {
    const contact = await getContact(ctx, sel.contactId);
    if (!contact) continue;

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
      recipientId: stableDocumentId("recipient", campaign.campaignId, contact.contactId),
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
      templateIdSnapshot: null,
      replyIntent: null,
      lastReplySnippet: "",
      // Set when the initial email actually leaves, so a threaded follow-up
      // can be pinned to the same inbox.
      sentFromConnectionId: null,
      // Outcomes are only ever set by a human, so every recipient starts blank.
      dealStatus: null,
      dealValueCents: null,
      dealNote: "",
      dealUpdatedAt: null,
      meetingBookedAt: null,
      aiOpenerSnapshot: "",
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
      openedAt: null,
      openCount: 0,
      firstClickedAt: null,
      clickCount: 0,
      trackedLinkUrls: {},
      lastError: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const eligibleRecipients = recipients.filter((r) => r.included);
  const startAt = startNow ? now : (campaign.schedule.startAt ?? now);
  const timestamps = computeSendTimestamps(startAt, eligibleRecipients.length, campaign.schedule);

  // A/B rotation: spread 2+ templates round-robin across recipients. A single
  // template (empty rotation) leaves templateIdSnapshot null → worker falls
  // back to campaign.initialTemplateId.
  const rotation = campaign.templateRotation.length > 1 ? campaign.templateRotation : [];

  const queueItems: QueueItem[] = eligibleRecipients.map((recipient, i) => {
    recipient.initialScheduledAt = timestamps[i];
    if (rotation.length > 0) recipient.templateIdSnapshot = rotation[i % rotation.length];
    return {
      queueItemId: stableDocumentId("queue", campaign.campaignId, recipient.recipientId, "0"),
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

  // Optional per-lead AI opener. Opt-in, bounded, and best-effort: capped in
  // volume, low concurrency (rate limits), and any failure just leaves an
  // empty opener so the launch always completes.
  const personalizeSettings = personalize ? await getOrgSettings(ctx.organizationId) : null;
  if (personalize && personalizeSettings && aiWritingEnabled(personalizeSettings)) {
    const settings = personalizeSettings;
    const targets = recipients.filter((r) => r.included).slice(0, MAX_PERSONALIZED);

    /**
     * Read each distinct prospect website once, before writing any openers.
     *
     * Deduplicating by domain first is not only an optimization. Doing the
     * lookup inside the opener loop would let several contacts at the same
     * company race: with three workers and fifty leads at one domain, three
     * fetches of the same site start before any of them writes the cache, and
     * the site sees a burst from us for no benefit. Resolving the distinct set
     * up front makes it exactly one fetch per company per launch.
     *
     * Higher concurrency than the opener loop because this is bounded by a
     * remote server's response time rather than by our own AI rate limit.
     */
    const domains = [
      ...new Set(
        targets.map((r) => lookupDomainFor(r.emailSnapshot)).filter((d): d is string => d !== null)
      ),
    ];
    const summaries = new Map<string, string>();
    await mapWithConcurrency(domains, LOOKUP_CONCURRENCY, async (domain) => {
      // Any failure leaves the domain absent from the map, and the opener is
      // written without it. Enrichment must never be able to fail a launch.
      const found = await lookupBusinessByDomain(domain);
      if (found?.summary) summaries.set(domain, found.summary);
    });

    await mapWithConcurrency(targets, PERSONALIZE_CONCURRENCY, async (r) => {
      const domain = lookupDomainFor(r.emailSnapshot);
      r.aiOpenerSnapshot = await generateOpener({
        firstName: r.firstNameSnapshot,
        businessName: r.businessNameSnapshot,
        brandContext: settings.aiBrandContext,
        businessSummary: domain ? summaries.get(domain) : undefined,
      });
    });
  }

  await batchCreateRecipients(owner, campaign.campaignId, recipients);
  await batchCreateQueueItems(owner, campaign.campaignId, queueItems);

  // Activate only after all durable work exists, but before publishing tasks.
  // Immediate tasks can now run safely; they can never observe PREPARING and
  // cancel themselves while launch is still enqueueing siblings.
  await setCampaignStatus(owner, campaign.campaignId, "ACTIVE", {
    totalRecipients: recipients.length,
    eligibleRecipients: eligibleRecipients.length,
    excludedRecipients: excluded,
    startedAt: now,
    launchStartedAt: null,
  });

  // NOTE: contacts are marked "contacted" only when an email actually sends
  // (in the send worker), never here at launch: otherwise recipients who are
  // paused, cancelled, or skipped before sending would be wrongly treated as
  // contacted and excluded from future campaigns.

  // Enqueue one Cloud Task per email. A failure here (e.g. queue not yet
  // provisioned) must not abort the launch after we've written recipients and
  // queue items: the items stay SCHEDULED and the repair sweep / manual retry
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

  const launchMessage = !tasksConfigured()
    ? `Campaign created with ${eligibleRecipients.length} recipients, but background sending is not configured yet: an administrator must set up Cloud Tasks.`
    : enqueueFailures > 0
      ? `Campaign started, but ${enqueueFailures} of ${eligibleRecipients.length} emails could not be scheduled with the sending service. Use “Retry failed” once it's fixed: nothing was lost.`
      : `Campaign started: ${eligibleRecipients.length} emails scheduled, ${excluded} excluded for safety.`;
  await recordEvent(owner, campaign.campaignId, {
    type: "LAUNCHED",
    message: launchMessage,
    severity: !tasksConfigured() || enqueueFailures > 0 ? "WARNING" : "INFO",
    recipientEmail: null,
  });

  return { eligible: eligibleRecipients.length, excluded };
}

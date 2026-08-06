import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import {
  claimQueueItem,
  commitDeliveryResult,
  getCampaign,
  getDailyCount,
  getRecipient,
  incrementCampaignCounters,
  isIdempotencyKeyUsed,
  recordEvent,
  reserveDailySend,
  reserveIdempotencyKey,
  setCampaignStatus,
  updateQueueItem,
  updateRecipient,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { checkEligibility } from "@/lib/campaigns/eligibility";
import { deferCampaignToNextDay } from "@/lib/campaigns/deferral";
import { markContacted, recordEmailSent } from "@/lib/repositories/contacts";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { isSuppressed } from "@/lib/repositories/suppressions";
import { getTemplate } from "@/lib/repositories/templates";
import { getSequence } from "@/lib/repositories/sequences";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import {
  renderTemplate,
  renderHtmlTemplate,
  valuesFromContact,
  valuesFromSenderProfile,
} from "@/lib/personalization/render";
import { createEmailDraft, sendEmail } from "@/lib/gmail/send";
import { localDayKey, nextValidTime } from "@/lib/scheduling/window";
import { enqueueTask } from "@/lib/tasks/enqueue";
import {
  buildNextFollowupQueueItem,
  publishFollowupQueueItem,
} from "@/lib/campaigns/followups";
import { recordCollisionContact } from "@/lib/campaigns/collision";
import { isTestModeForOrg } from "@/lib/sending/mode";
import { reportError } from "@/lib/observability/report";
import { warmupDailyCap } from "@/lib/campaigns/warmup";
import { resolveTracking, tracksAnything } from "@/lib/tracking/settings";
import { injectTracking } from "@/lib/tracking/inject";
import { env } from "@/lib/env";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PLANS } from "@/lib/billing/plans";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { unsubscribeUrl } from "@/lib/unsubscribe/token";
import { appendVisibleUnsubscribeLink } from "@/lib/campaigns/compliance";

const PayloadSchema = z.object({
  organizationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  campaignId: z.string().min(1),
  queueItemId: z.string().min(1),
});

const AUTO_PAUSE_ERROR_THRESHOLD = 5;
// How many times a *pre-send* failure (DB blip, token refresh, rendering) may
// be retried before we give up on the item. Failures at/after the Gmail send
// are never auto-retried (the outcome is ambiguous: a retry could double-send).
const MAX_PRESEND_ATTEMPTS = 4;

/**
 * Cloud Tasks worker: send (or draft) one campaign message.
 * Follows the spec §14 worker contract; every Gmail call goes through
 * the Gmail wrapper, which applies the organization TEST/LIVE safety gate.
 *
 * Returns 200 for permanent no-ops (so Cloud Tasks does not retry) and
 * 500 only for transient errors where a retry is safe.
 */
export async function POST(req: NextRequest) {
  try {
    await verifyTaskRequest(req);
  } catch (err) {
    const message = err instanceof TaskAuthError ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const parsed = PayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "BAD_PAYLOAD" }, { status: 200 });
  }
  const { organizationId, ownerUserId, campaignId, queueItemId } = parsed.data;
  const owner: OwnerRef = { userId: ownerUserId, organizationId };

  // 1. Claim (transactional; replay-safe no-op when already handled).
  const item = await claimQueueItem(owner, campaignId, queueItemId);
  if (!item) return NextResponse.json({ ok: true, reason: "NOT_CLAIMABLE" });

  // Stale-delivery guard: if this item was mass-rescheduled to a future
  // time (e.g. a daily-limit re-spread), release it: the Cloud Task
  // enqueued for the new time owns it now.
  if (item.scheduledAt > Date.now() + 5 * 60_000) {
    await updateQueueItem(owner, campaignId, queueItemId, { status: "SCHEDULED" });
    return NextResponse.json({ ok: true, reason: "RESCHEDULED_FOR_LATER" });
  }

  const fail = async (reason: string, retryable: boolean, error?: string) => {
    // Map the block reason to what should happen to the queue item:
    // paused/disconnected → stays SCHEDULED so Resume can re-enqueue it;
    // stopped/cancelled → CANCELLED; everything else → SKIPPED.
    const resumable =
      reason === "CAMPAIGN_PAUSED" ||
      reason === "GMAIL_NOT_CONNECTED" ||
      reason === "FOLLOWUPS_PAUSED";
    const terminal =
      reason.startsWith("CAMPAIGN_") && !resumable ? "CANCELLED" : "SKIPPED";
    await updateQueueItem(owner, campaignId, queueItemId, {
      status: retryable ? "RETRY_SCHEDULED" : resumable ? "SCHEDULED" : terminal,
      lastError: error ?? reason,
    });
    return NextResponse.json({ ok: true, reason }, { status: 200 });
  };

  // True once we reach the Gmail send; gates whether a failure may auto-retry.
  let reachedDeliveryAttempt = false;
  // Once the authoritative Firestore result commits, later projection errors
  // must never rewrite the completed queue item as AMBIGUOUS.
  let deliveryCommitted = false;
  const enqueueCurrentItem = async (scheduledAt: number) => {
    const taskName = await enqueueTask(
      "send-message",
      { organizationId, ownerUserId, campaignId, queueItemId },
      scheduledAt
    );
    await updateQueueItem(owner, campaignId, queueItemId, {
      cloudTaskName: taskName,
    });
  };
  try {
    // 2. Load state.
    const [campaign, recipient, connection, settings] = await Promise.all([
      getCampaign(owner, campaignId),
      getRecipient(owner, campaignId, item.recipientId),
      getConnection(ownerUserId),
      getOrgSettings(organizationId),
    ]);
    if (!campaign || !recipient) return fail("MISSING_RECORDS", false);
    // Three ceilings, lowest wins: what the customer chose, what their plan
    // allows, and what a new inbox should be doing while it builds a history.
    const effectiveDailyLimit = Math.min(
      campaign.schedule.dailySendLimit,
      PLANS[settings.billing.plan].maxDailySends,
      warmupDailyCap(connection?.createdAt)
    );
    const effectiveCampaign = {
      ...campaign,
      schedule: { ...campaign.schedule, dailySendLimit: effectiveDailyLimit },
    };

    const [suppression, keyUsed, sentToday] = await Promise.all([
      isSuppressed(owner, recipient.normalizedEmailSnapshot),
      isIdempotencyKeyUsed(owner, campaignId, item.idempotencyKey),
      getDailyCount(owner, localDayKey(Date.now(), campaign.schedule.timezone)),
    ]);

    // 3. Full eligibility re-check immediately before sending.
    const eligibility = checkEligibility({
      campaign: effectiveCampaign,
      recipient,
      queueItem: { status: "PROCESSING", type: item.type },
      gmailConnected: connection?.status === "CONNECTED",
      suppressed: suppression !== null,
      emailOptOut: false, // opt-outs are stored as suppressions at import
      idempotencyKeyUsed: keyUsed,
      now: Date.now(),
      sentTodayCount: sentToday,
    });

    if (!eligibility.eligible) {
      if (eligibility.retryable) {
        if (eligibility.reason === "DAILY_LIMIT_REACHED") {
          // Release our claim, then re-spread the WHOLE remaining queue
          // across tomorrow with the campaign's pacing. Rescheduling each
          // blocked email individually to "window open" made them all fire
          // at the same instant the next morning.
          await updateQueueItem(owner, campaignId, queueItemId, {
            status: "SCHEDULED",
            lastError: eligibility.reason,
          });
          const result = await deferCampaignToNextDay(owner, campaign);
          if (result === null) {
            // Another task already ran today's re-spread. If it happened
            // before we released our claim, our item may have been missed.
            // Give it its own next-day slot, preserving its time of day.
            const base = item.scheduledAt > 0 ? item.scheduledAt : Date.now();
            let candidate = base;
            while (candidate <= Date.now()) candidate += 24 * 60 * 60 * 1000;
            const nextTime = Math.max(
              nextValidTime(candidate, campaign.schedule),
              Date.now() + 60_000
            );
            await updateQueueItem(owner, campaignId, queueItemId, {
              status: "SCHEDULED",
              scheduledAt: nextTime,
              lastError: eligibility.reason,
            });
            await enqueueCurrentItem(nextTime);
          }
          return NextResponse.json({ ok: true, reason: eligibility.reason });
        }

        // Outside window: push this send forward, keeping its own time of
        // day when possible so spacing survives.
        const nextTime = Math.max(
          nextValidTime(Date.now() + 60_000, campaign.schedule),
          Date.now() + 60_000
        );
        await updateQueueItem(owner, campaignId, queueItemId, {
          status: "SCHEDULED",
          scheduledAt: nextTime,
          lastError: eligibility.reason,
        });
        await enqueueCurrentItem(nextTime);
        return NextResponse.json({ ok: true, reason: eligibility.reason, rescheduled: nextTime });
      }
      if (eligibility.reason === "GMAIL_NOT_CONNECTED" && campaign.status === "ACTIVE") {
        await setCampaignStatus(owner, campaignId, "PAUSED", { pausedAt: Date.now() });
        await recordEvent(owner, campaignId, {
          type: "AUTO_PAUSE",
          message: "Campaign paused: your Gmail connection needs to be reconnected.",
          severity: "ERROR",
          recipientEmail: null,
        });
      }
      await updateRecipient(owner, campaignId, item.recipientId, {
        status: recipient.repliedAt ? "REPLIED" : recipient.status,
      });
      return fail(eligibility.reason, false);
    }

    // 4. Resolve the email body for this step. Follow-up steps may reuse the
    // initial email, use their own saved template, or use a custom body
    // written inline in the sequence builder.
    const isFollowup = item.sequenceStep > 0;
    const sequence = campaign.sequenceId
      ? await getSequence(owner, campaign.sequenceId)
      : null;
    let step = null;
    if (isFollowup) {
      if (!sequence?.active) {
        return fail("SEQUENCE_MISSING_OR_INACTIVE", false);
      }
      step = sequence?.steps[item.sequenceStep - 1] ?? null;
      if (!step?.enabled) {
        return fail("SEQUENCE_STEP_MISSING_OR_DISABLED", false);
      }
    }

    // A/B rotation: this recipient's assigned template (falls back to the
    // campaign's primary template for non-rotation campaigns).
    const initialTemplateId = recipient.templateIdSnapshot ?? campaign.initialTemplateId;
    const initialTemplate = initialTemplateId
      ? await getTemplate(owner, initialTemplateId)
      : null;

    const pauseMissingBody = async () => {
      await setCampaignStatus(owner, campaignId, "PAUSED", { pausedAt: Date.now() });
      await recordEvent(owner, campaignId, {
        type: "AUTO_PAUSE",
        message: "Campaign paused: the email content is no longer available.",
        severity: "ERROR",
        recipientEmail: null,
      });
      return fail("TEMPLATE_MISSING", false);
    };

    let bodyHtmlTemplate: string;
    let plainText: string | undefined;
    let baseSubject: string;

    if (step && step.bodyMode === "CUSTOM") {
      bodyHtmlTemplate = step.customHtml || "<p></p>";
      plainText = undefined;
      baseSubject = step.customSubject || initialTemplate?.subjectTemplate || "Following up";
    } else {
      const tId = step?.bodyMode === "TEMPLATE" ? step.templateId : initialTemplateId;
      const template = tId ? await getTemplate(owner, tId) : initialTemplate;
      if (!template) return pauseMissingBody();
      bodyHtmlTemplate = template.htmlTemplate;
      plainText = template.plainTextTemplate || undefined;
      baseSubject = template.subjectTemplate;
    }

    const profile = await getSenderProfile(owner);
    const values = {
      ...valuesFromContact({
        firstName: recipient.firstNameSnapshot,
        lastName: "",
        fullName: recipient.fullNameSnapshot,
        businessName: recipient.businessNameSnapshot,
        email: recipient.emailSnapshot,
        phone: recipient.phoneSnapshot,
        region: "",
        requestedAmount: null,
        leadSource: "",
      }),
      ...valuesFromSenderProfile(profile),
      // Per-lead AI opener applies to the initial email only, never follow-ups.
      ai_opener: step ? "" : recipient.aiOpenerSnapshot ?? "",
    };

    // Subject: follow-up steps can keep the original, prefix "Re:", or use
    // a custom subject line.
    let subjectTemplate = baseSubject;
    if (step) {
      if (step.subjectMode === "KEEP" || step.subjectMode === "RE") {
        subjectTemplate = initialTemplate?.subjectTemplate ?? baseSubject;
      } else if (step.subjectMode === "CUSTOM" && step.customSubject) {
        subjectTemplate = step.customSubject;
      }
    }
    const subjectRender = renderTemplate(subjectTemplate, values);
    const subjectOutput =
      step?.subjectMode === "RE" && !/^re:/i.test(subjectRender.output)
        ? `Re: ${subjectRender.output}`
        : subjectRender.output;
    // If this lead has an AI opener but the template didn't place {{ai_opener}}
    // anywhere, prepend it as the first line so personalization always shows.
    let effectiveBody = bodyHtmlTemplate;
    if (!step && recipient.aiOpenerSnapshot && !/\{\{\s*ai_opener\s*\}\}/.test(effectiveBody)) {
      effectiveBody = `<p>{{ai_opener}}</p>\n${effectiveBody}`;
    }
    const body = renderHtmlTemplate(effectiveBody, values);
    const plainTextRender = plainText
      ? renderTemplate(plainText, values)
      : null;
    const unresolved = [
      ...subjectRender.unresolved,
      ...body.unresolved,
      ...(plainTextRender?.unresolved ?? []),
    ].filter((name, index, all) => all.indexOf(name) === index);
    if (unresolved.length > 0) {
      const message = `Missing values for: ${unresolved.join(", ")}`;
      await Promise.all([
        updateRecipient(owner, campaignId, item.recipientId, {
          status: "ERROR",
          lastError: message,
        }),
        incrementCampaignCounters(owner, campaignId, { errorCount: 1 }),
      ]);
      return fail("UNRESOLVED_PLACEHOLDERS", false, message);
    }
    const renderedPlainText = plainTextRender?.output;

    const isDraft =
      item.type === "CREATE_INITIAL_DRAFT" || item.type === "CREATE_FOLLOWUP_DRAFT";

    // Final cancellation/suppression/reply check after rendering and directly
    // before quota/delivery reservation. Control actions close their campaign
    // gate first, so this catches a pause/stop that raced the earlier load.
    const [
      freshCampaign,
      freshRecipient,
      freshSuppression,
      deliveryUsed,
      freshConnection,
    ] =
      await Promise.all([
        getCampaign(owner, campaignId),
        getRecipient(owner, campaignId, item.recipientId),
        isSuppressed(owner, recipient.normalizedEmailSnapshot),
        isIdempotencyKeyUsed(owner, campaignId, item.idempotencyKey),
        getConnection(ownerUserId),
      ]);
    const finalBlock =
      !freshCampaign
        ? "CAMPAIGN_MISSING"
        : freshCampaign.status === "PAUSED"
          ? "CAMPAIGN_PAUSED"
          : freshCampaign.status !== "ACTIVE"
            ? `CAMPAIGN_${freshCampaign.status}`
            : freshConnection?.status !== "CONNECTED"
              ? "GMAIL_NOT_CONNECTED"
            : !freshRecipient || !freshRecipient.included
              ? "RECIPIENT_NOT_ELIGIBLE"
              : freshRecipient.repliedAt !== null
                ? "RECIPIENT_REPLIED"
                : freshRecipient.bouncedAt !== null
                  ? "RECIPIENT_BOUNCED"
                  : freshRecipient.unsubscribedAt !== null
                    ? "RECIPIENT_UNSUBSCRIBED"
                    : isFollowup && freshCampaign.followupsPaused
                      ? "FOLLOWUPS_PAUSED"
                      : freshSuppression
                        ? "SUPPRESSED"
                        : deliveryUsed
                          ? "DELIVERY_ALREADY_RESERVED"
                          : null;
    if (finalBlock) {
      if (
        finalBlock === "GMAIL_NOT_CONNECTED" &&
        freshCampaign?.status === "ACTIVE"
      ) {
        await setCampaignStatus(owner, campaignId, "PAUSED", {
          pausedAt: Date.now(),
        });
        await recordEvent(owner, campaignId, {
          type: "AUTO_PAUSE",
          message:
            "Campaign paused: your Gmail connection needs to be reconnected.",
          severity: "ERROR",
          recipientEmail: null,
        });
      }
      return fail(finalBlock, false);
    }

    // Atomically reserve today's allowance immediately before a real send.
    // Draft creation never consumes send quota.
    if (!isDraft) {
      const dayKey = localDayKey(Date.now(), campaign.schedule.timezone);
      const quota = await reserveDailySend(
        owner,
        dayKey,
        effectiveDailyLimit,
        item.idempotencyKey
      );
      if (!quota.reserved) {
        await updateQueueItem(owner, campaignId, queueItemId, {
          status: "SCHEDULED",
          lastError: "DAILY_LIMIT_REACHED",
        });
        const result = await deferCampaignToNextDay(owner, effectiveCampaign);
        if (result === null) {
          // A concurrent worker may have completed the campaign-wide
          // re-spread before this item released PROCESSING. Give this item a
          // safe individual slot so it cannot be stranded without a task.
          const base = item.scheduledAt > 0 ? item.scheduledAt : Date.now();
          let candidate = base;
          while (candidate <= Date.now()) candidate += 24 * 60 * 60 * 1000;
          const nextTime = Math.max(
            nextValidTime(candidate, effectiveCampaign.schedule),
            Date.now() + 60_000
          );
          await updateQueueItem(owner, campaignId, queueItemId, {
            status: "SCHEDULED",
            scheduledAt: nextTime,
            lastError: "DAILY_LIMIT_REACHED",
          });
          await enqueueCurrentItem(nextTime);
        }
        return NextResponse.json({ ok: true, reason: "DAILY_LIMIT_REACHED" });
      }
    }

    // 5. Reserve the idempotency key BEFORE sending (transactional).
    const reserved = await reserveIdempotencyKey(owner, campaignId, item.idempotencyKey, {
      queueItemId,
      recipientId: item.recipientId,
    });
    if (!reserved) return fail("DELIVERY_ALREADY_RESERVED", false);

    // 6. Send through the user's Gmail (safety gate inside sendEmail).
    // Test vs real is the ORG's current sending mode, resolved fresh here.
    const testMode = await isTestModeForOrg(organizationId);
    const threaded = isFollowup && step?.sameThread && recipient.gmailThreadId;

    // Optional open/click tracking is skipped in test mode so test sends never
    // write real engagement data. Opens and clicks are separate choices and
    // both default off: see lib/tracking/settings.ts for the trade.
    let finalHtml = sanitizeEmailHtml(body.output);
    let trackingLinkUrls: string[] | null = null;
    const tracking = resolveTracking(campaign);
    if (tracksAnything(campaign) && !testMode) {
      const injected = injectTracking(
        finalHtml,
        { ownerUserId, organizationId, campaignId, recipientId: item.recipientId, step: item.sequenceStep },
        env.APP_BASE_URL,
        tracking
      );
      finalHtml = injected.html;
      trackingLinkUrls = injected.linkUrls;
    }

    const signedUnsubscribeUrl = !testMode
      ? unsubscribeUrl({
          ownerUserId,
          organizationId,
          campaignId,
          recipientId: item.recipientId,
        })
      : undefined;
    if (signedUnsubscribeUrl) {
      // Append after tracking injection so an opt-out never travels through a
      // tracking redirect and remains available if tracking is unavailable.
      finalHtml = appendVisibleUnsubscribeLink(finalHtml, signedUnsubscribeUrl);
    }

    // Past this point a failure's outcome is ambiguous: never retry.
    reachedDeliveryAttempt = true;
    const deliveryInput = {
      userId: ownerUserId,
      to: recipient.emailSnapshot,
      subject: subjectOutput,
      htmlBody: finalHtml,
      textBody: signedUnsubscribeUrl
        ? `${renderedPlainText}\n\nUnsubscribe: ${signedUnsubscribeUrl}`
        : renderedPlainText,
      testMode,
      threadId: threaded ? recipient.gmailThreadId ?? undefined : undefined,
      inReplyToMessageId: threaded ? recipient.initialMessageId ?? undefined : undefined,
      unsubscribeUrl: signedUnsubscribeUrl,
    };
    const result = isDraft
      ? await createEmailDraft(deliveryInput)
      : await sendEmail(deliveryInput);

    // 7–8. Atomically record the message, recipient, queue, and campaign
    // counter so a post-Gmail Firestore failure cannot leave partial state.
    const now = Date.now();
    if (isDraft) {
      const draftResult = result as typeof result & { gmailDraftId: string };
      await commitDeliveryResult(owner, campaignId, {
        idempotencyKey: item.idempotencyKey,
        queueItemId,
        recipientId: item.recipientId,
        completedAt: now,
        counter: "draftedCount",
        result: {
          gmailMessageId: draftResult.gmailMessageId,
          gmailThreadId: draftResult.gmailThreadId,
          gmailDraftId: draftResult.gmailDraftId,
          sentTo: draftResult.effectiveTo,
          subject: draftResult.effectiveSubject,
          status: "DRAFTED",
        },
        recipientPatch: {
          status: "DRAFTED",
          initialDraftId:
            item.sequenceStep === 0 ? draftResult.gmailDraftId : recipient.initialDraftId,
          gmailThreadId: recipient.gmailThreadId ?? draftResult.gmailThreadId,
          currentStep: item.sequenceStep,
          lastError: null,
        },
      });
      deliveryCommitted = true;
      await recordEvent(owner, campaignId, {
        type: "DRAFTED",
        message: `Draft created for ${recipient.emailSnapshot}`,
        severity: "INFO",
        recipientEmail: recipient.emailSnapshot,
      }).catch((err) => reportError(err, { scope: "draft-event" }));
      await maybeMarkCompleted(owner, campaignId).catch((err) =>
        reportError(err, { scope: "campaign-completion-check" })
      );
      return NextResponse.json({ ok: true, drafted: true });
    }

    const nextFollowup = buildNextFollowupQueueItem(
      owner,
      campaign,
      sequence,
      item.recipientId,
      item.sequenceStep,
      now
    );
    const deliveryCommit = await commitDeliveryResult(owner, campaignId, {
      idempotencyKey: item.idempotencyKey,
      queueItemId,
      recipientId: item.recipientId,
      completedAt: now,
      counter: item.sequenceStep === 0 ? "sentCount" : "followupSentCount",
      nextQueueItem: nextFollowup,
      result: {
        gmailMessageId: result.gmailMessageId,
        gmailThreadId: result.gmailThreadId,
        sentTo: result.effectiveTo,
        subject: result.effectiveSubject,
        status: "SENT",
      },
      recipientPatch: {
        status: "SENT",
        initialMessageId: item.sequenceStep === 0 ? result.gmailMessageId : recipient.initialMessageId,
        gmailThreadId: recipient.gmailThreadId ?? result.gmailThreadId,
        initialSentAt: item.sequenceStep === 0 ? now : recipient.initialSentAt,
        lastSentAt: now,
        currentStep: item.sequenceStep,
        ...(trackingLinkUrls
          ? {
              trackedLinkUrls: {
                ...recipient.trackedLinkUrls,
                [String(item.sequenceStep)]: trackingLinkUrls,
              },
            }
          : {}),
      },
    });
    deliveryCommitted = true;

    // Mark the contact as genuinely contacted (initial send only) so
    // prior-contact detection reflects real sends, not launch-time intent.
    if (item.sequenceStep === 0) {
      await markContacted(owner, recipient.contactId, {
        campaignId,
        campaignName: campaign.name,
        at: now,
      });
    }
    // Every genuinely sent email (initial or follow-up) counts on the lead's
    // engagement stats.
    await recordEmailSent(owner, recipient.contactId, now);

    // Record org-scoped collision hash (no-op unless a team policy is on).
    await recordCollisionContact(
      owner.organizationId,
      owner.userId,
      recipient.normalizedEmailSnapshot
    ).catch((err) => reportError(err, { scope: "collision-record" }));

    // 9. Publish the already-durable next follow-up, if any. If this fails,
    // repairOwner sees its null task name and safely publishes it later.
    let followupScheduleFailed = false;
    if (deliveryCommit.nextFollowupCommitted && nextFollowup) {
      await publishFollowupQueueItem(owner, nextFollowup).catch(async (err) => {
        followupScheduleFailed = true;
        reportError(err, { scope: "followup-schedule" });
        await recordEvent(owner, campaignId, {
          type: "FOLLOWUP_SCHEDULE_ERROR",
          message:
            "The email was sent and its next follow-up is safely queued, but Cloud Task publication failed. The repair sweep will retry it.",
          severity: "ERROR",
          recipientEmail: recipient.emailSnapshot,
        }).catch(() => undefined);
      });
    }

    // 10. Audit event.
    await recordEvent(owner, campaignId, {
      type: "SENT",
      message:
        item.sequenceStep === 0
          ? `Email sent to ${recipient.emailSnapshot}`
          : `Follow-up ${item.sequenceStep} sent to ${recipient.emailSnapshot}`,
      severity: "INFO",
      recipientEmail: recipient.emailSnapshot,
    }).catch((err) => reportError(err, { scope: "send-event" }));

    if (!followupScheduleFailed) {
      await maybeMarkCompleted(owner, campaignId).catch((err) =>
        reportError(err, { scope: "campaign-completion-check" })
      );
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (deliveryCommitted) {
      reportError(err, { scope: "post-delivery-projection" });
      return NextResponse.json({
        ok: true,
        delivered: true,
        warning: "POST_DELIVERY_PROJECTION_FAILED",
      });
    }

    // Pre-send failures (Firestore blips, token refresh, rendering) never put
    // an email on the wire, so re-claiming is safe: retry a bounded number of
    // times instead of silently dropping the recipient. The item-scoped
    // idempotency reservation guarantees the retry can't double-send.
    if (!reachedDeliveryAttempt && item.attemptCount < MAX_PRESEND_ATTEMPTS) {
      await updateQueueItem(owner, campaignId, queueItemId, {
        status: "RETRY_SCHEDULED",
        lastError: message,
      });
      // 500 → Cloud Tasks retries with backoff; RETRY_SCHEDULED is claimable.
      return NextResponse.json({ ok: false, error: message, willRetry: true }, { status: 500 });
    }

    reportError(err, { scope: "send-worker" });
    await updateQueueItem(owner, campaignId, queueItemId, {
      status: reachedDeliveryAttempt ? "AMBIGUOUS" : "ERROR",
      lastError: message,
    });
    await incrementCampaignCounters(owner, campaignId, { errorCount: 1 });

    const campaign = await getCampaign(owner, campaignId);
    if (campaign && campaign.errorCount + 1 >= AUTO_PAUSE_ERROR_THRESHOLD && campaign.status === "ACTIVE") {
      await setCampaignStatus(owner, campaignId, "PAUSED", { pausedAt: Date.now() });
      await recordEvent(owner, campaignId, {
        type: "AUTO_PAUSE",
        message:
          "Campaign paused automatically after repeated sending problems. Check your Gmail connection, then resume.",
        severity: "ERROR",
        recipientEmail: null,
      });
    }
    if (reachedDeliveryAttempt) {
      await recordEvent(owner, campaignId, {
        type: "DELIVERY_AMBIGUOUS",
        message:
          "Gmail may have accepted one message, but Cadence could not confirm the result. It was not retried to prevent a duplicate.",
        severity: "ERROR",
        recipientEmail: null,
      });
    }
    return NextResponse.json(
      { ok: false, error: message, ambiguous: reachedDeliveryAttempt },
      { status: reachedDeliveryAttempt ? 200 : 500 }
    );
  }
}

async function maybeMarkCompleted(owner: OwnerRef, campaignId: string): Promise<void> {
  const { listQueueItems } = await import("@/lib/repositories/campaigns");
  const open = await listQueueItems(owner, campaignId, [
    "PENDING",
    "SCHEDULED",
    "PROCESSING",
    "RETRY_SCHEDULED",
  ]);
  if (open.length === 0) {
    const campaign = await getCampaign(owner, campaignId);
    if (campaign?.status === "ACTIVE") {
      await setCampaignStatus(owner, campaignId, "COMPLETED", { completedAt: Date.now() });
      await recordEvent(owner, campaignId, {
        type: "COMPLETED",
        message: "Campaign finished: every scheduled email has been handled.",
        severity: "INFO",
        recipientEmail: null,
      });
    }
  }
}

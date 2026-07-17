import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import {
  claimQueueItem,
  finalizeMessage,
  getCampaign,
  getDailyCount,
  getRecipient,
  incrementCampaignCounters,
  incrementDailyCounter,
  isIdempotencyKeyUsed,
  recordEvent,
  reserveIdempotencyKey,
  setCampaignStatus,
  updateQueueItem,
  updateRecipient,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { checkEligibility } from "@/lib/campaigns/eligibility";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { isSuppressed } from "@/lib/repositories/suppressions";
import { getTemplate } from "@/lib/repositories/templates";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import {
  renderTemplate,
  valuesFromContact,
  valuesFromSenderProfile,
} from "@/lib/personalization/render";
import { sendEmail } from "@/lib/gmail/send";
import { localDayKey, nextValidTime } from "@/lib/scheduling/window";
import { enqueueTask } from "@/lib/tasks/enqueue";
import { scheduleNextFollowup } from "@/lib/campaigns/followups";

const PayloadSchema = z.object({
  organizationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  campaignId: z.string().min(1),
  queueItemId: z.string().min(1),
});

const AUTO_PAUSE_ERROR_THRESHOLD = 5;

/**
 * Cloud Tasks worker: send (or draft) one campaign message.
 * Follows the spec §14 worker contract; every Gmail call goes through
 * sendEmail, which applies the TEST_MODE safety gate.
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

  const fail = async (reason: string, retryable: boolean, error?: string) => {
    // Map the block reason to what should happen to the queue item:
    // paused/disconnected → stays SCHEDULED so Resume can re-enqueue it;
    // stopped/cancelled → CANCELLED; everything else → SKIPPED.
    const resumable = reason === "CAMPAIGN_PAUSED" || reason === "GMAIL_NOT_CONNECTED";
    const terminal =
      reason.startsWith("CAMPAIGN_") && !resumable ? "CANCELLED" : "SKIPPED";
    await updateQueueItem(owner, campaignId, queueItemId, {
      status: retryable ? "RETRY_SCHEDULED" : resumable ? "SCHEDULED" : terminal,
      lastError: error ?? reason,
    });
    return NextResponse.json({ ok: true, reason }, { status: 200 });
  };

  try {
    // 2. Load state.
    const [campaign, recipient, connection] = await Promise.all([
      getCampaign(owner, campaignId),
      getRecipient(owner, campaignId, item.recipientId),
      getConnection(ownerUserId),
    ]);
    if (!campaign || !recipient) return fail("MISSING_RECORDS", false);

    const [suppression, keyUsed, sentToday] = await Promise.all([
      isSuppressed(owner, recipient.normalizedEmailSnapshot),
      isIdempotencyKeyUsed(owner, campaignId, item.idempotencyKey),
      getDailyCount(owner, localDayKey(Date.now(), campaign.schedule.timezone)),
    ]);

    // 3. Full eligibility re-check immediately before sending.
    const eligibility = checkEligibility({
      campaign,
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
        // Outside window or daily cap: reschedule to the next valid time.
        const nextTime = Math.max(
          nextValidTime(Date.now() + 60_000, campaign.schedule),
          Date.now() + 60_000
        );
        await updateQueueItem(owner, campaignId, queueItemId, {
          status: "SCHEDULED",
          scheduledAt: nextTime,
          lastError: eligibility.reason,
        });
        await enqueueTask(
          "send-message",
          { organizationId, ownerUserId, campaignId, queueItemId },
          nextTime
        );
        if (eligibility.reason === "DAILY_LIMIT_REACHED") {
          await recordEvent(owner, campaignId, {
            type: "DAILY_LIMIT",
            message: "Daily limit reached; sending resumes tomorrow.",
            severity: "INFO",
            recipientEmail: null,
          });
        }
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

    // 4. Render the personalized message.
    const template = campaign.initialTemplateId
      ? await getTemplate(owner, campaign.initialTemplateId)
      : null;
    if (!template) {
      await setCampaignStatus(owner, campaignId, "PAUSED", { pausedAt: Date.now() });
      await recordEvent(owner, campaignId, {
        type: "AUTO_PAUSE",
        message: "Campaign paused: the email template is no longer available.",
        severity: "ERROR",
        recipientEmail: null,
      });
      return fail("TEMPLATE_MISSING", false);
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
    };
    const subject = renderTemplate(template.subjectTemplate, values);
    const body = renderTemplate(template.htmlTemplate, values);

    // 5. Reserve the idempotency key BEFORE sending (transactional).
    const reserved = await reserveIdempotencyKey(owner, campaignId, item.idempotencyKey, {
      queueItemId,
      recipientId: item.recipientId,
    });
    if (!reserved) return fail("ALREADY_SENT", false);

    // 6. Send through the user's Gmail (safety gate inside sendEmail).
    const result = await sendEmail({
      userId: ownerUserId,
      to: recipient.emailSnapshot,
      subject: subject.output,
      htmlBody: body.output,
      textBody: template.plainTextTemplate || undefined,
    });

    // 7–8. Record results.
    const now = Date.now();
    await Promise.all([
      finalizeMessage(owner, campaignId, item.idempotencyKey, {
        gmailMessageId: result.gmailMessageId,
        gmailThreadId: result.gmailThreadId,
        sentTo: result.effectiveTo,
        subject: result.effectiveSubject,
      }),
      updateRecipient(owner, campaignId, item.recipientId, {
        status: "SENT",
        initialMessageId: item.sequenceStep === 0 ? result.gmailMessageId : recipient.initialMessageId,
        gmailThreadId: recipient.gmailThreadId ?? result.gmailThreadId,
        initialSentAt: item.sequenceStep === 0 ? now : recipient.initialSentAt,
        lastSentAt: now,
        currentStep: item.sequenceStep,
      }),
      updateQueueItem(owner, campaignId, queueItemId, {
        status: "COMPLETE",
        completedAt: now,
        lastError: null,
      }),
      incrementDailyCounter(owner, localDayKey(now, campaign.schedule.timezone)),
      incrementCampaignCounters(
        owner,
        campaignId,
        item.sequenceStep === 0 ? { sentCount: 1 } : { followupSentCount: 1 }
      ),
    ]);

    // 9. Schedule the next follow-up step, if a sequence is attached.
    await scheduleNextFollowup(owner, campaign, item.recipientId, item.sequenceStep);

    // 10. Audit event.
    await recordEvent(owner, campaignId, {
      type: "SENT",
      message:
        item.sequenceStep === 0
          ? `Email sent to ${recipient.emailSnapshot}`
          : `Follow-up ${item.sequenceStep} sent to ${recipient.emailSnapshot}`,
      severity: "INFO",
      recipientEmail: recipient.emailSnapshot,
    });

    await maybeMarkCompleted(owner, campaignId);

    return NextResponse.json({ ok: true, sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateQueueItem(owner, campaignId, queueItemId, {
      status: "ERROR",
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
    // 500 → Cloud Tasks retries with backoff; the claim/idempotency layers
    // make retries safe.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
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
        message: "Campaign finished — every scheduled email has been handled.",
        severity: "INFO",
        recipientEmail: null,
      });
    }
  }
}

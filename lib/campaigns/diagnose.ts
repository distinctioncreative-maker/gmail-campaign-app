import "server-only";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { Campaign } from "@/schemas/campaign";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getTemplate } from "@/lib/repositories/templates";
import { getDailyCount, listQueueItems, ownerFromCtx } from "@/lib/repositories/campaigns";
import { tasksConfigured } from "@/lib/tasks/enqueue";
import { isInWindow, localDayKey } from "@/lib/scheduling/window";
import { assessBounces, DEFAULT_BOUNCE_GUARD } from "@/lib/campaigns/bounceGuard";
import { warmupState } from "@/lib/campaigns/warmup";
import { assessEngagement, DEFAULT_ENGAGEMENT } from "@/lib/campaigns/engagementPace";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";

export type DiagnosticStatus = "ok" | "warn" | "fail";

export interface DiagnosticCheck {
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

export interface CampaignDiagnosis {
  overall: DiagnosticStatus;
  checks: DiagnosticCheck[];
  errorSamples: string[];
}

/**
 * Plain-language health check for a campaign: answers "why aren't my emails
 * sending?" using data the app already has. No new tracking: reads the Gmail
 * connection, sender profile, template, Cloud Tasks config, send window, daily
 * cap, and the campaign's own queue.
 */
export async function diagnoseCampaign(
  ctx: AuthContext,
  campaign: Campaign
): Promise<CampaignDiagnosis> {
  const owner = ownerFromCtx(ctx);
  const now = Date.now();

  const [connection, profile, queue, sentToday] = await Promise.all([
    getConnectionPublic(ctx.userId),
    getSenderProfile(ctx),
    listQueueItems(owner, campaign.campaignId),
    getDailyCount(owner, localDayKey(now, campaign.schedule.timezone)),
  ]);

  const template = campaign.initialTemplateId
    ? await getTemplate(ctx, campaign.initialTemplateId)
    : null;

  const checks: DiagnosticCheck[] = [];

  // 1. Gmail connection
  checks.push(
    connection?.status === "CONNECTED"
      ? { label: "Gmail connected", status: "ok", detail: `Sending from ${connection.connectedEmail}.` }
      : { label: "Gmail connected", status: "fail", detail: "Connect Gmail in Settings: nothing can send without it." }
  );

  // 2. Required sender details (commercial-email compliance)
  const missingProfile: string[] = [];
  if (!profile.physicalAddress.trim()) missingProfile.push("mailing address");
  if (!profile.unsubscribeText.trim()) missingProfile.push("opt-out sentence");
  checks.push(
    missingProfile.length === 0
      ? { label: "Sender details complete", status: "ok", detail: "Mailing address and opt-out text are set." }
      : { label: "Sender details complete", status: "fail", detail: `Add your ${missingProfile.join(" and ")} in Settings: required to send.` }
  );

  // 3. Email content
  checks.push(
    !campaign.initialTemplateId
      ? { label: "Email template", status: "fail", detail: "No template is attached to this campaign." }
      : !template || !template.active
        ? { label: "Email template", status: "fail", detail: "The attached template no longer exists." }
        : { label: "Email template", status: "ok", detail: `Using “${template.name}”.` }
  );

  // 4. Background sending infrastructure
  checks.push(
    tasksConfigured()
      ? { label: "Background sending", status: "ok", detail: "The sending service is configured." }
      : { label: "Background sending", status: "fail", detail: "Cloud Tasks isn't set up yet: an administrator must finish setup before emails send." }
  );

  // 5. Campaign status
  const statusLabel = CAMPAIGN_STATUS_LABELS[campaign.status]?.label ?? campaign.status;
  checks.push(
    campaign.status === "ACTIVE"
      ? { label: "Campaign is running", status: "ok", detail: "The campaign is active and sending." }
      : campaign.status === "PAUSED"
        ? { label: "Campaign is running", status: "warn", detail: "Paused: resume it to continue sending." }
        : campaign.status === "DRAFT"
          ? { label: "Campaign is running", status: "warn", detail: "Still a draft: launch it to start sending." }
          : { label: "Campaign is running", status: campaign.status === "COMPLETED" ? "ok" : "warn", detail: `Status: ${statusLabel}.` }
  );

  // 6. Send window
  const inWindow = isInWindow(now, campaign.schedule);
  checks.push(
    inWindow
      ? { label: "Inside the send window", status: "ok", detail: `Sending hours are ${campaign.schedule.sendWindowStart}–${campaign.schedule.sendWindowEnd}.` }
      : { label: "Inside the send window", status: "warn", detail: `Outside sending hours (${campaign.schedule.sendWindowStart}–${campaign.schedule.sendWindowEnd}): emails resume at the next allowed time.` }
  );

  // 7. Daily limit
  const capReached = sentToday >= campaign.schedule.dailySendLimit;
  checks.push(
    capReached
      ? { label: "Daily limit", status: "warn", detail: `Daily limit reached (${sentToday}/${campaign.schedule.dailySendLimit}). Raise it with “Override today's limit”, or sending resumes tomorrow.` }
      : { label: "Daily limit", status: "ok", detail: `${sentToday} of ${campaign.schedule.dailySendLimit} sent today.` }
  );

  // 8. Warmup. A capped inbox otherwise looks like a stuck campaign: the
  // daily limit check would just say "limit reached" with no reason why.
  const warmup = warmupState(connection?.createdAt);
  if (warmup.active) {
    checks.push({
      label: "Inbox warmup",
      status: "warn",
      detail: warmup.message ?? "This inbox is still building a sending history.",
    });
  }

  // 9. Bounce rate. Sending stops itself above the stop threshold, so this
  // exists to show the number climbing before it trips rather than after.
  const bounce = assessBounces(campaign);
  checks.push(
    bounce.verdict === "STOP"
      ? {
          label: "Bounce rate",
          status: "fail",
          detail: bounce.message ?? "Bounce rate is above the automatic stop threshold.",
        }
      : bounce.verdict === "WARN"
        ? {
            label: "Bounce rate",
            status: "warn",
            detail: bounce.message ?? "Bounce rate is climbing.",
          }
        : {
            label: "Bounce rate",
            status: "ok",
            detail:
              bounce.sent < DEFAULT_BOUNCE_GUARD.minimumSends
                ? `${bounce.bounced} bounce${bounce.bounced === 1 ? "" : "s"} so far. Too few sends yet to judge a rate.`
                : `${(bounce.rate * 100).toFixed(1)}% (${bounce.bounced} of ${bounce.sent}). Healthy.`,
          }
  );

  // 9b. Reply rate, which now feeds pacing. A throttled campaign would
  // otherwise present as "daily limit reached" at a number lower than the one
  // the customer set, with nothing anywhere explaining the difference.
  const engagement = assessEngagement({
    sentCount: campaign.sentCount,
    replyCount: campaign.replyCount,
    dailySendLimit: campaign.schedule.dailySendLimit,
  });
  if (engagement.verdict === "POOR" || engagement.verdict === "WEAK") {
    checks.push({
      label: "Reply rate",
      status: "warn",
      detail: engagement.message ?? "Sending is eased back while the reply rate is low.",
    });
  } else if (engagement.verdict === "STRONG") {
    checks.push({
      label: "Reply rate",
      status: "ok",
      detail: engagement.message ?? "Reply rate is well above average.",
    });
  } else {
    checks.push({
      label: "Reply rate",
      status: "ok",
      detail:
        engagement.verdict === "UNPROVEN"
          ? `${engagement.replied} repl${engagement.replied === 1 ? "y" : "ies"} so far. A reply can arrive days after a send, so pacing ignores the rate until ${DEFAULT_ENGAGEMENT.minimumSends} emails have gone out.`
          : `${(engagement.replyRate * 100).toFixed(1)}% (${engagement.replied} of ${engagement.sent}). Normal for cold outreach.`,
    });
  }

  // 10. Queue health
  const byStatus = (s: string) => queue.filter((q) => q.status === s).length;
  const errored = queue.filter((q) => q.status === "ERROR");
  const scheduled = byStatus("SCHEDULED") + byStatus("PENDING") + byStatus("RETRY_SCHEDULED");
  const complete = byStatus("COMPLETE");
  if (errored.length > 0) {
    checks.push({
      label: "Delivery errors",
      status: "warn",
      detail: `${errored.length} email(s) hit an error. Use “Retry failed” after fixing the cause.`,
    });
  } else {
    checks.push({
      label: "Delivery errors",
      status: "ok",
      detail: `${scheduled} scheduled · ${complete} sent · no errors.`,
    });
  }

  const errorSamples = [...new Set(errored.map((q) => q.lastError).filter(Boolean) as string[])].slice(0, 5);

  const overall: DiagnosticStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";

  return { overall, checks, errorSamples };
}

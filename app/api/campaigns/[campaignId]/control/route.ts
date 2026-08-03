import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  getCampaign,
  ownerFromCtx,
  restoreDeletedCampaign,
  updateCampaign,
} from "@/lib/repositories/campaigns";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PLANS } from "@/lib/billing/plans";
import { assessPaceRisk } from "@/lib/campaigns/paceSafety";
import {
  cancelAndDeleteDrafts,
  cancelRemaining,
  cloneCampaign,
  pauseCampaign,
  resumeCampaign,
  retryFailed,
  sendNextBatchNow,
  skipRecipient,
  stopCampaign,
  toggleFollowups,
  updatePace,
  releaseLeads,
} from "@/lib/campaigns/controls";

const PaceSchema = z.object({
  dailySendLimit: z.number().int().min(1).max(2000).optional(),
  emailsPerBatch: z.number().int().min(1).max(50).optional(),
  minDelaySeconds: z.number().int().min(1).max(600).optional(),
  maxDelaySeconds: z.number().int().min(1).max(600).optional(),
  interBatchDelayMinutes: z.number().min(0).max(240).optional(),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const BodySchema = z.object({
  action: z.enum([
    "pause",
    "resume",
    "stop",
    "cancel_remaining",
    "cancel_delete_drafts",
    "send_next_batch",
    "retry_failed",
    "skip_recipient",
    "pause_followups",
    "resume_followups",
    "clone",
    "update_pace",
    "release_leads",
    "archive",
    "unarchive",
    "restore_deleted",
  ]),
  recipientId: z.string().optional(),
  pace: PaceSchema.optional(),
  acceptPaceRisk: z.boolean().default(false),
});

export const POST = handleApiErrors(async (req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const campaign = await getCampaign(ownerFromCtx(ctx), campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const { action, recipientId, pace, acceptPaceRisk } = BodySchema.parse(await req.json());

  if (campaign.deletedAt !== null && action !== "restore_deleted") {
    return NextResponse.json(
      { error: "Restore this campaign before using campaign controls." },
      { status: 400 }
    );
  }

  switch (action) {
    case "pause":
      if (campaign.status !== "ACTIVE")
        return NextResponse.json({ error: "Only a sending campaign can be paused." }, { status: 400 });
      return NextResponse.json({ message: await pauseCampaign(ctx, campaign) });
    case "resume":
      if (campaign.status !== "PAUSED")
        return NextResponse.json({ error: "Only a paused campaign can be resumed." }, { status: 400 });
      return NextResponse.json({ message: await resumeCampaign(ctx, campaign) });
    case "stop":
      return NextResponse.json({ message: await stopCampaign(ctx, campaign) });
    case "cancel_remaining":
      return NextResponse.json({ message: await cancelRemaining(ctx, campaign) });
    case "cancel_delete_drafts":
      return NextResponse.json({ message: await cancelAndDeleteDrafts(ctx, campaign) });
    case "send_next_batch":
      if (campaign.status !== "ACTIVE")
        return NextResponse.json({ error: "The campaign must be sending to do that." }, { status: 400 });
      return NextResponse.json({ message: await sendNextBatchNow(ctx, campaign) });
    case "retry_failed":
      return NextResponse.json({ message: await retryFailed(ctx, campaign) });
    case "skip_recipient": {
      if (!recipientId)
        return NextResponse.json({ error: "Choose a recipient to remove." }, { status: 400 });
      return NextResponse.json({ message: await skipRecipient(ctx, campaign, recipientId) });
    }
    case "pause_followups":
      return NextResponse.json({ message: await toggleFollowups(ctx, campaign, true) });
    case "resume_followups":
      return NextResponse.json({ message: await toggleFollowups(ctx, campaign, false) });
    case "clone": {
      const newId = await cloneCampaign(ctx, campaign);
      return NextResponse.json({ message: "Campaign duplicated.", campaignId: newId });
    }
    case "update_pace": {
      if (!pace || Object.keys(pace).length === 0)
        return NextResponse.json({ error: "No pace changes were provided." }, { status: 400 });
      if (pace.maxDelaySeconds !== undefined && pace.minDelaySeconds !== undefined && pace.maxDelaySeconds < pace.minDelaySeconds)
        return NextResponse.json({ error: "Max delay must be greater than or equal to min delay." }, { status: 400 });
      const settings = await getOrgSettings(ctx.organizationId);
      const planCap = PLANS[settings.billing.plan].maxDailySends;
      const requestedDailyLimit = pace.dailySendLimit ?? campaign.schedule.dailySendLimit;
      if (requestedDailyLimit > planCap) {
        return NextResponse.json(
          { error: `Your ${PLANS[settings.billing.plan].name} plan allows up to ${planCap} emails per day.` },
          { status: 403 }
        );
      }
      const merged = { ...campaign.schedule, ...pace };
      const risk = assessPaceRisk(merged);
      if (risk.risky && !acceptPaceRisk) {
        return NextResponse.json(
          {
            error: "This pace risks deliverability. Review and explicitly confirm the warning before saving it.",
            requiresPaceConfirmation: true,
            reasons: risk.reasons,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ message: await updatePace(ctx, campaign, pace) });
    }
    case "release_leads":
      return NextResponse.json({ message: await releaseLeads(ctx, campaign) });
    case "archive": {
      if (campaign.deletedAt !== null)
        return NextResponse.json({ error: "Restore this campaign before archiving it." }, { status: 400 });
      if (["ACTIVE", "PAUSED"].includes(campaign.status))
        return NextResponse.json({ error: "Stop the campaign before archiving it." }, { status: 400 });
      await updateCampaign(ownerFromCtx(ctx), campaignId, {
        archived: true,
        archivedAt: Date.now(),
      });
      return NextResponse.json({ message: "Campaign archived." });
    }
    case "unarchive": {
      if (campaign.deletedAt !== null)
        return NextResponse.json({ error: "Use Recently Deleted to restore this campaign." }, { status: 400 });
      await updateCampaign(ownerFromCtx(ctx), campaignId, {
        archived: false,
        archivedAt: null,
      });
      return NextResponse.json({ message: "Campaign restored." });
    }
    case "restore_deleted": {
      if (campaign.deletedAt === null)
        return NextResponse.json({ error: "This campaign is not deleted." }, { status: 400 });
      await restoreDeletedCampaign(ownerFromCtx(ctx), campaignId);
      return NextResponse.json({ message: "Campaign restored to the active list." });
    }
  }
});

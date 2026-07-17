import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getCampaign, ownerFromCtx } from "@/lib/repositories/campaigns";
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
} from "@/lib/campaigns/controls";

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
  ]),
  recipientId: z.string().optional(),
});

export const POST = handleApiErrors(async (req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const campaign = await getCampaign(ownerFromCtx(ctx), campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const { action, recipientId } = BodySchema.parse(await req.json());

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
  }
});

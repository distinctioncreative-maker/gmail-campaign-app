import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  deleteCampaign,
  getCampaign,
  listEvents,
  listRecipients,
  ownerFromCtx,
  updateCampaign,
} from "@/lib/repositories/campaigns";
import {
  CampaignScheduleSchema,
  DraftStrategySchema,
  PriorContactPolicySchema,
} from "@/schemas/campaign";

type Params = { params: Promise<{ campaignId: string }> };

export const GET = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const [recipients, events] = await Promise.all([
    listRecipients(owner, campaignId),
    listEvents(owner, campaignId),
  ]);
  return NextResponse.json({ campaign, recipients, events });
});

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  initialTemplateId: z.string().nullable().optional(),
  schedule: CampaignScheduleSchema.partial().optional(),
  priorContactPolicy: PriorContactPolicySchema.optional(),
  priorContactExcludeDays: z.number().int().min(1).max(365).optional(),
  draftStrategy: DraftStrategySchema.optional(),
});

/** Update campaign settings. Schedule changes apply to future sends only. */
export const PATCH = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const patch = PatchSchema.parse(await req.json());
  await updateCampaign(owner, campaignId, {
    ...patch,
    schedule: patch.schedule
      ? CampaignScheduleSchema.parse({ ...campaign.schedule, ...patch.schedule })
      : undefined,
  });
  return NextResponse.json({ ok: true });
});

/** Permanently delete a campaign. Only DRAFT campaigns (never launched) can be
 * deleted; anything that has run stays as a record and must be stopped/cancelled. */
export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (campaign.status !== "DRAFT") {
    return NextResponse.json(
      {
        error:
          "Only draft campaigns can be deleted. Stop or cancel a running campaign instead — finished campaigns stay as a record.",
      },
      { status: 400 }
    );
  }

  await deleteCampaign(owner, campaignId);
  return NextResponse.json({ ok: true });
});

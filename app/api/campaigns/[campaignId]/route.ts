import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  getCampaign,
  listEvents,
  listRecipients,
  ownerFromCtx,
  purgeCampaign,
  softDeleteCampaign,
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
  if (campaign.deletedAt !== null) {
    return NextResponse.json(
      { error: "Restore this campaign before changing its settings." },
      { status: 400 }
    );
  }

  const patch = PatchSchema.parse(await req.json());
  await updateCampaign(owner, campaignId, {
    ...patch,
    schedule: patch.schedule
      ? CampaignScheduleSchema.parse({ ...campaign.schedule, ...patch.schedule })
      : undefined,
  });
  return NextResponse.json({ ok: true });
});

/** Move a terminal campaign to Recently Deleted. A permanent recursive delete
 * requires ?permanent=1 and is accepted only for an already soft-deleted row. */
export const DELETE = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (req.nextUrl.searchParams.get("permanent") === "1") {
    if (campaign.deletedAt === null) {
      return NextResponse.json(
        { error: "Move this campaign to Recently Deleted before deleting it forever." },
        { status: 400 }
      );
    }
    await purgeCampaign(owner, campaignId);
    return NextResponse.json({ ok: true, permanent: true });
  }

  const deletable = ["DRAFT", "STOPPED", "CANCELLED", "COMPLETED", "ERROR"];
  if (!deletable.includes(campaign.status)) {
    return NextResponse.json(
      {
        error:
          "Stop or cancel this campaign before deleting it. Drafts and finished (stopped, cancelled, completed) campaigns can be deleted.",
      },
      { status: 400 }
    );
  }

  if (campaign.deletedAt === null) {
    await softDeleteCampaign(owner, campaignId);
  }
  return NextResponse.json({ ok: true, recoverable: true });
});

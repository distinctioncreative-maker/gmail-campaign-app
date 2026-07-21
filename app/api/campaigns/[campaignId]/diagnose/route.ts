import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getCampaign, ownerFromCtx } from "@/lib/repositories/campaigns";
import { diagnoseCampaign } from "@/lib/campaigns/diagnose";

type Params = { params: Promise<{ campaignId: string }> };

/** Run the plain-language health check for a campaign. */
export const GET = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const campaign = await getCampaign(ownerFromCtx(ctx), campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const diagnosis = await diagnoseCampaign(ctx, campaign);
  return NextResponse.json(diagnosis);
});

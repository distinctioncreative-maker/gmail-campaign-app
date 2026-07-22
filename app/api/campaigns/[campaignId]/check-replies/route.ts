import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getCampaign, ownerFromCtx } from "@/lib/repositories/campaigns";
import { runReplyScan } from "@/lib/campaigns/replyScan";

type Params = { params: Promise<{ campaignId: string }> };

/** Per-campaign entry point for the same on-demand scan — kept so the
 * campaign page's "Check for replies now" button can 404 on a bad id. */
export const POST = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  if (!(await getCampaign(owner, campaignId)))
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  return NextResponse.json(await runReplyScan(owner));
});

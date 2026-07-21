import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getCampaign, ownerFromCtx } from "@/lib/repositories/campaigns";
import { processRepliesForUser, processBouncesForUser } from "@/lib/campaigns/monitoring";

type Params = { params: Promise<{ campaignId: string }> };

/**
 * On-demand reply + bounce scan for the signed-in user's mailbox, so a user
 * doesn't have to wait for the periodic sweep. Reuses the exact same
 * monitoring logic the scheduled sweeps run.
 */
export const POST = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const [replies, bounces] = await Promise.all([
    processRepliesForUser(owner),
    processBouncesForUser(owner),
  ]);

  const parts: string[] = [];
  if (replies.replied > 0) parts.push(`${replies.replied} new repl${replies.replied === 1 ? "y" : "ies"}`);
  if (bounces.bounces > 0) parts.push(`${bounces.bounces} bounce${bounces.bounces === 1 ? "" : "s"}`);
  const message =
    parts.length > 0
      ? `Found ${parts.join(" and ")}.`
      : `Checked ${replies.checked} recipient${replies.checked === 1 ? "" : "s"} — no new replies or bounces yet.`;

  return NextResponse.json({ ...replies, ...bounces, message });
});

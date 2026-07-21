import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { ownerFromCtx } from "@/lib/repositories/campaigns";
import { processRepliesForUser, processBouncesForUser } from "@/lib/campaigns/monitoring";

/**
 * On-demand reply + bounce scan across the signed-in user's whole mailbox,
 * triggered from the Analytics page so a user doesn't have to wait for the
 * periodic sweep (or open a specific campaign) to reconcile replies. Reuses the
 * exact monitoring logic the scheduled sweeps and per-campaign button run.
 */
export const POST = handleApiErrors(async (_req: NextRequest) => {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);

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

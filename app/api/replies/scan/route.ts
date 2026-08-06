import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { ownerFromCtx } from "@/lib/repositories/campaigns";
import { runReplyScan } from "@/lib/campaigns/replyScan";

/** On-demand reply + bounce scan across the signed-in user's whole mailbox,
 * plus a lead-engagement backfill. Triggered from Reports and Replies. */
export const POST = handleApiErrors(async (_req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.replyScan);
  return NextResponse.json(await runReplyScan(ownerFromCtx(ctx)));
});

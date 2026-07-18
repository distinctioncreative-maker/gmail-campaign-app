import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { resolveSendingState } from "@/lib/sending/mode";

/** Any signed-in user can read the current sending mode (for reassurance
 * in the campaign wizard). Changing it is admin-only elsewhere. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const state = await resolveSendingState(ctx.organizationId);
  return NextResponse.json({ testMode: state.testMode, mode: state.mode });
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  cancelDeletion,
  deletionState,
  requestDeletion,
} from "@/lib/account/deletion";
import { DeletionScopeSchema } from "@/schemas/deletion";
import { describeRemaining, GRACE_PERIOD_DAYS } from "@/lib/account/eligibility";
import { auditActor, recordAudit } from "@/lib/audit/log";

/** What the customer would be agreeing to, and whether they may. */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const scope = DeletionScopeSchema.catch("ACCOUNT").parse(
    req.nextUrl.searchParams.get("scope") ?? "ACCOUNT"
  );
  const state = await deletionState(ctx, scope);
  return NextResponse.json({
    request: state.request,
    allowed: state.verdict.allowed,
    effectiveScope: state.verdict.effectiveScope,
    reason: state.verdict.reason,
    gracePeriodDays: GRACE_PERIOD_DAYS,
  });
});

const RequestSchema = z.object({
  scope: DeletionScopeSchema,
  /** Typed confirmation. A destructive action reached by one click is one
   * misclick away from a customer losing everything they built. */
  confirmation: z.string().trim(),
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = RequestSchema.parse(await req.json());
  if (input.confirmation.toUpperCase() !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm." },
      { status: 400 }
    );
  }

  const request = await requestDeletion(ctx, input.scope);
  await recordAudit(auditActor(ctx), {
    action: "account.deletion_requested",
    summary: `${ctx.email} scheduled deletion of the ${request.scope === "WORKSPACE" ? "whole workspace" : "account"}.`,
    details: { scope: request.scope, purgeAfter: request.purgeAfter },
  });
  return NextResponse.json({
    request,
    message: `Scheduled. ${describeRemaining(request.purgeAfter, Date.now())} You can cancel any time before then.`,
  });
});

/** Change of mind, which is the entire reason the grace period exists. */
export const DELETE = handleApiErrors(async () => {
  const ctx = await requireUser();
  const cancelled = await cancelDeletion(ctx);
  if (cancelled) {
    await recordAudit(auditActor(ctx), {
      action: "account.deletion_cancelled",
      summary: `${ctx.email} cancelled the scheduled deletion.`,
    });
  }
  return NextResponse.json({
    cancelled,
    message: cancelled
      ? "Deletion cancelled. Nothing was removed."
      : "There was no scheduled deletion to cancel.",
  });
});

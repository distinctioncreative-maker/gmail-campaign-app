import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { ForbiddenError } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  addSuppression,
  deactivateSuppression,
  listOrgSuppressions,
  listSuppressions,
} from "@/lib/repositories/suppressions";
import { isValidEmail, normalizeEmail } from "@/lib/parser/normalize";
import { SuppressionReasonSchema, SuppressionScopeSchema } from "@/schemas/suppression";

/** List the user's suppressions (plus org-level ones, labeled). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const [mine, org] = await Promise.all([
    listSuppressions(ctx, 500),
    listOrgSuppressions(ctx, 500),
  ]);
  return NextResponse.json({ suppressions: [...mine, ...org] });
});

const AddSchema = z.object({
  emails: z.array(z.string()).min(1).max(1000),
  reason: SuppressionReasonSchema.default("MANUAL"),
  scope: SuppressionScopeSchema.default("USER"),
  details: z.string().max(500).default(""),
});

/** Add one or many suppressions (manual / bulk paste / CSV rows). */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { emails, reason, scope, details } = AddSchema.parse(await req.json());

  if (scope === "ORGANIZATION" && ctx.role !== "ADMIN") {
    throw new ForbiddenError("Only admins can add organization-wide exclusions.");
  }

  let added = 0;
  let skippedInvalid = 0;
  for (const raw of emails) {
    const email = raw.trim();
    if (!isValidEmail(email)) {
      skippedInvalid++;
      continue;
    }
    await addSuppression(ctx, {
      email,
      normalizedEmail: normalizeEmail(email),
      reason,
      scope,
      source: "MANUAL",
      details,
    });
    added++;
  }
  return NextResponse.json({ added, skippedInvalid });
});

const RemoveSchema = z.object({
  suppressionId: z.string().min(1),
  scope: SuppressionScopeSchema,
  reason: z.string().min(3).max(500),
});

/** Deactivate a suppression. Requires a reason; ADMIN for org scope. */
export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { suppressionId, scope, reason } = RemoveSchema.parse(await req.json());

  if (scope === "ORGANIZATION" && ctx.role !== "ADMIN") {
    throw new ForbiddenError("Only admins can remove organization-wide exclusions.");
  }

  const ok = await deactivateSuppression(ctx, suppressionId, scope, reason);
  if (!ok) {
    return NextResponse.json({ error: "That entry was not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});

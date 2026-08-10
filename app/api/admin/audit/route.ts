import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listAuditLog } from "@/lib/audit/log";
import { AuditActionSchema } from "@/schemas/audit";

/**
 * Read the audit trail.
 *
 * Read-only by design. There is no POST, PATCH, or DELETE here and there never
 * should be: entries are written by the code performing the audited action, and
 * a route that let a client append to the log would let it write history.
 *
 * Admin-only, because the log names who did what: it is a record about the
 * workspace's people, not a feature every member needs.
 */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");

  const rawAction = req.nextUrl.searchParams.get("action");
  const parsedAction = rawAction ? AuditActionSchema.safeParse(rawAction) : null;
  const rawBefore = Number(req.nextUrl.searchParams.get("before"));

  const page = await listAuditLog(ctx.organizationId, {
    limit: 50,
    before: Number.isFinite(rawBefore) && rawBefore > 0 ? rawBefore : null,
    // An unrecognised action filters nothing rather than erroring: a stale
    // bookmark should show the log, not a validation message.
    action: parsedAction?.success ? parsedAction.data : null,
  });

  return NextResponse.json(page);
});

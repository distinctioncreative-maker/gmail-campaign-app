import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, listMembers, setMemberAccess, setMemberActive } from "@/lib/repositories/orgSettings";
import { purchasedSeatLimit } from "@/lib/billing/plans";

export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  return NextResponse.json({ members: await listMembers(ctx.organizationId) });
});

const PatchSchema = z.object({
  userId: z.string().min(1),
  accessRoleId: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { userId, accessRoleId, active } = PatchSchema.parse(await req.json());

  const settings = await getOrgSettings(ctx.organizationId);
  const builtInRole = accessRoleId?.startsWith("builtin:")
    ? accessRoleId.slice("builtin:".length)
    : null;
  const customRole = accessRoleId?.startsWith("custom:")
    ? settings.customRoles.find((role) => role.id === accessRoleId.slice("custom:".length)) ?? null
    : null;
  const resolvedRole =
    builtInRole === "SALES_REP" || builtInRole === "MANAGER" || builtInRole === "ADMIN"
      ? builtInRole
      : customRole?.baseRole;
  if (accessRoleId && !resolvedRole) {
    return NextResponse.json({ error: "Choose a valid workspace role." }, { status: 400 });
  }

  // Guard against an admin locking themselves out entirely.
  if (
    userId === ctx.userId &&
    ((resolvedRole !== undefined && resolvedRole !== "ADMIN") || active === false)
  ) {
    return NextResponse.json(
      { error: "You can't remove your own admin access here." },
      { status: 400 }
    );
  }

  if (active !== undefined) {
    const result = await setMemberActive(
      ctx.organizationId,
      userId,
      active,
      purchasedSeatLimit(settings.billing)
    );
    if (result === "NOT_FOUND") {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (result === "SEAT_LIMIT") {
      return NextResponse.json(
        { error: "Purchase another seat before reactivating this member." },
        { status: 409 }
      );
    }
  }
  if (resolvedRole) {
    await setMemberAccess(ctx.organizationId, userId, resolvedRole, customRole);
  }
  return NextResponse.json({ ok: true });
});

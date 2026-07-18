import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listMembers, setMemberActive, setMemberRole } from "@/lib/repositories/orgSettings";
import { RoleSchema } from "@/schemas/common";

export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  return NextResponse.json({ members: await listMembers(ctx.organizationId) });
});

const PatchSchema = z.object({
  userId: z.string().min(1),
  role: RoleSchema.optional(),
  active: z.boolean().optional(),
});

export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { userId, role, active } = PatchSchema.parse(await req.json());

  // Guard against an admin locking themselves out entirely.
  if (userId === ctx.userId && (role === "SALES_REP" || active === false)) {
    return NextResponse.json(
      { error: "You can't remove your own admin access here." },
      { status: 400 }
    );
  }

  if (role) await setMemberRole(ctx.organizationId, userId, role);
  if (active !== undefined) await setMemberActive(ctx.organizationId, userId, active);
  return NextResponse.json({ ok: true });
});

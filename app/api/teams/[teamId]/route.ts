import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getTeam, updateTeam, deleteTeam } from "@/lib/repositories/teams";

type Params = { params: Promise<{ teamId: string }> };

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  leadUserId: z.string().min(1).nullable().optional(),
});

/** Rename a team or change its lead. Admin only. */
export const PATCH = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireRole("ADMIN");
  const { teamId } = await params;
  if (!(await getTeam(ctx.organizationId, teamId)))
    return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const patch = PatchSchema.parse(await req.json());
  await updateTeam(ctx.organizationId, teamId, patch);
  return NextResponse.json({ ok: true, message: "Team updated." });
});

/** Delete a team (members become unassigned). Admin only. */
export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireRole("ADMIN");
  const { teamId } = await params;
  if (!(await getTeam(ctx.organizationId, teamId)))
    return NextResponse.json({ error: "Team not found." }, { status: 404 });

  await deleteTeam(ctx.organizationId, teamId);
  return NextResponse.json({ ok: true, message: "Team deleted. Its members are now unassigned." });
});

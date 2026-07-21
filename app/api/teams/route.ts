import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listTeams, createTeam } from "@/lib/repositories/teams";
import { listMembers } from "@/lib/repositories/orgSettings";

/** Teams + members for the Team section (Team Leads and Admins only). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("MANAGER", "ADMIN");
  const [teams, members] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);
  return NextResponse.json({
    teams,
    members: members.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      active: m.active,
      teamId: m.teamId,
    })),
  });
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  leadUserId: z.string().min(1).nullable().optional(),
});

/** Create a team. Admin only — admins set up teams and pick each lead. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = CreateSchema.parse(await req.json());
  const team = await createTeam(ctx.organizationId, {
    name: input.name,
    leadUserId: input.leadUserId ?? null,
  });
  return NextResponse.json({ team, message: `Team "${team.name}" created.` });
});

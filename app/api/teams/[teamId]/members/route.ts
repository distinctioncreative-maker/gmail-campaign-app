import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ForbiddenError } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getTeam, listTeams, setMemberTeam } from "@/lib/repositories/teams";
import { getMember } from "@/lib/repositories/organizations";
import { canManageTeamMembership } from "@/lib/teams/access";

type Params = { params: Promise<{ teamId: string }> };

const BodySchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

/**
 * Add or remove a rep on a team. Admins manage any team; a Team Lead
 * (MANAGER) manages only teams they lead, and can only pull in reps who are
 * unassigned — moving someone off another lead's team takes an admin.
 */
export const POST = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireRole("MANAGER", "ADMIN");
  const { teamId } = await params;
  const { userId, action } = BodySchema.parse(await req.json());

  const [team, teams, target] = await Promise.all([
    getTeam(ctx.organizationId, teamId),
    listTeams(ctx.organizationId),
    getMember(ctx.organizationId, userId),
  ]);
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "That person is not in your organization." }, { status: 404 });

  if (!canManageTeamMembership({ userId: ctx.userId, role: ctx.role }, teamId, teams)) {
    throw new ForbiddenError("Only this team's lead or an admin can change its members.");
  }

  if (action === "add") {
    if (target.teamId === teamId)
      return NextResponse.json({ ok: true, message: "Already on this team." });
    if (target.teamId !== null && ctx.role !== "ADMIN") {
      return NextResponse.json(
        { error: "That person is already on another team — ask an admin to move them." },
        { status: 409 }
      );
    }
    await setMemberTeam(ctx.organizationId, userId, teamId);
    return NextResponse.json({ ok: true, message: `${target.email} added to ${team.name}.` });
  }

  if (target.teamId !== teamId)
    return NextResponse.json({ error: "That person is not on this team." }, { status: 409 });
  await setMemberTeam(ctx.organizationId, userId, null);
  return NextResponse.json({ ok: true, message: `${target.email} removed from ${team.name}.` });
});

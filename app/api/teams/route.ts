import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listTeams, createTeam } from "@/lib/repositories/teams";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { ledTeamIds, viewableUserIds } from "@/lib/teams/access";

/** Teams + members for the Team section (Team Leads and Admins only). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("MANAGER", "ADMIN");
  const [teams, members, settings] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
    getOrgSettings(ctx.organizationId),
  ]);
  if (!capabilitiesFor(ctx.tenantType, settings.billing.plan).teams) {
    return NextResponse.json({ error: "Team features require the Team plan." }, { status: 403 });
  }
  const visibleIds = new Set(
    viewableUserIds(
      { userId: ctx.userId, role: ctx.role },
      teams,
      members.map((m) => ({ userId: m.userId, teamId: m.teamId }))
    )
  );
  const visibleTeamIds =
    ctx.role === "ADMIN" ? null : new Set(ledTeamIds(ctx.userId, teams));
  return NextResponse.json({
    teams: visibleTeamIds
      ? teams.filter((team) => visibleTeamIds.has(team.teamId))
      : teams,
    members: members.filter((m) => visibleIds.has(m.userId)).map((m) => ({
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
  const [settings, members] = await Promise.all([
    getOrgSettings(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);
  if (!capabilitiesFor(ctx.tenantType, settings.billing.plan).teams) {
    return NextResponse.json({ error: "Team features require the Team plan." }, { status: 403 });
  }
  if (input.leadUserId) {
    const lead = members.find((member) => member.userId === input.leadUserId);
    if (!lead?.active || (lead.role !== "MANAGER" && lead.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Choose an active manager from this organization as the team lead." },
        { status: 400 }
      );
    }
  }
  const team = await createTeam(ctx.organizationId, {
    name: input.name,
    leadUserId: input.leadUserId ?? null,
  });
  return NextResponse.json({ team, message: `Team "${team.name}" created.` });
});

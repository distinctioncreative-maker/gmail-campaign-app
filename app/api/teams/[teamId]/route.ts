import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { deleteTeam, getTeam, listTeams, updateTeam } from "@/lib/repositories/teams";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { wouldCreateTeamCycle } from "@/lib/teams/hierarchy";

type Params = { params: Promise<{ teamId: string }> };

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  leadUserId: z.string().min(1).nullable().optional(),
  parentTeamId: z.string().min(1).nullable().optional(),
});

/** Rename a team or change its lead. Admin only. */
export const PATCH = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireRole("ADMIN");
  const { teamId } = await params;
  const settings = await getOrgSettings(ctx.organizationId);
  if (!capabilitiesFor(ctx.tenantType, settings.billing.plan).teams) {
    return NextResponse.json({ error: "Team features require the Team plan." }, { status: 403 });
  }
  if (!(await getTeam(ctx.organizationId, teamId)))
    return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const patch = PatchSchema.parse(await req.json());
  if (patch.leadUserId) {
    const members = await listMembers(ctx.organizationId);
    const lead = members.find((member) => member.userId === patch.leadUserId);
    if (!lead?.active || (lead.role !== "MANAGER" && lead.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Choose an active manager from this organization as the team lead." },
        { status: 400 }
      );
    }
  }
  if (patch.parentTeamId !== undefined) {
    const teams = await listTeams(ctx.organizationId);
    if (
      patch.parentTeamId !== null &&
      !teams.some((team) => team.teamId === patch.parentTeamId)
    ) {
      return NextResponse.json({ error: "Parent team not found." }, { status: 400 });
    }
    if (wouldCreateTeamCycle(teamId, patch.parentTeamId, teams)) {
      return NextResponse.json(
        { error: "A team cannot sit beneath itself or one of its descendants." },
        { status: 400 }
      );
    }
  }
  await updateTeam(ctx.organizationId, teamId, patch);
  return NextResponse.json({ ok: true, message: "Team updated." });
});

/** Delete a team (members become unassigned). Admin only. */
export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireRole("ADMIN");
  const { teamId } = await params;
  const settings = await getOrgSettings(ctx.organizationId);
  if (!capabilitiesFor(ctx.tenantType, settings.billing.plan).teams) {
    return NextResponse.json({ error: "Team features require the Team plan." }, { status: 403 });
  }
  if (!(await getTeam(ctx.organizationId, teamId)))
    return NextResponse.json({ error: "Team not found." }, { status: 404 });

  await deleteTeam(ctx.organizationId, teamId);
  return NextResponse.json({ ok: true, message: "Team deleted. Its members are now unassigned." });
});

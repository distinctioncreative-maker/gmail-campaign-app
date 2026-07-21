import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { TeamSchema, type Team } from "@/schemas/user";

function teamsRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId).collection("teams");
}

function membersRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId).collection("members");
}

export async function listTeams(organizationId: string): Promise<Team[]> {
  const snap = await teamsRef(organizationId).limit(200).get();
  return snap.docs
    .map((d) => TeamSchema.parse(d.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeam(organizationId: string, teamId: string): Promise<Team | null> {
  const snap = await teamsRef(organizationId).doc(teamId).get();
  return snap.exists ? TeamSchema.parse(snap.data()) : null;
}

export async function createTeam(
  organizationId: string,
  input: { name: string; leadUserId: string | null }
): Promise<Team> {
  const now = Date.now();
  const team: Team = TeamSchema.parse({
    teamId: crypto.randomUUID(),
    organizationId,
    name: input.name,
    leadUserId: input.leadUserId,
    createdAt: now,
    updatedAt: now,
  });
  await teamsRef(organizationId).doc(team.teamId).create(team);
  return team;
}

export async function updateTeam(
  organizationId: string,
  teamId: string,
  patch: Partial<Pick<Team, "name" | "leadUserId">>
): Promise<void> {
  await teamsRef(organizationId)
    .doc(teamId)
    .update({ ...patch, updatedAt: Date.now() });
}

/** Delete a team and unassign all of its members. */
export async function deleteTeam(organizationId: string, teamId: string): Promise<void> {
  const assigned = await membersRef(organizationId).where("teamId", "==", teamId).get();
  const batch = firestore().batch();
  const now = Date.now();
  for (const doc of assigned.docs) batch.update(doc.ref, { teamId: null, updatedAt: now });
  batch.delete(teamsRef(organizationId).doc(teamId));
  await batch.commit();
}

/** Move a member onto a team (or off any team with teamId = null). */
export async function setMemberTeam(
  organizationId: string,
  userId: string,
  teamId: string | null
): Promise<void> {
  await membersRef(organizationId).doc(userId).update({ teamId, updatedAt: Date.now() });
}

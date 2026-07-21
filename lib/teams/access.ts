import type { Role } from "@/schemas/common";

/**
 * Pure team-visibility rules — no Firestore access, fully unit-testable.
 *
 * ADMIN      → sees and manages everyone and every team.
 * MANAGER    → sees the members of teams they lead (plus themselves);
 *              can add/remove reps only within their own teams.
 * SALES_REP  → sees only themselves; the Team section is hidden entirely.
 */

export interface TeamLite {
  teamId: string;
  leadUserId: string | null;
}

export interface MemberLite {
  userId: string;
  teamId: string | null;
}

/** Teams this user leads. */
export function ledTeamIds(userId: string, teams: TeamLite[]): string[] {
  return teams.filter((t) => t.leadUserId === userId).map((t) => t.teamId);
}

/** Which member userIds the viewer may see (drill-down included). */
export function viewableUserIds(
  viewer: { userId: string; role: Role },
  teams: TeamLite[],
  members: MemberLite[]
): string[] {
  if (viewer.role === "ADMIN") return members.map((m) => m.userId);
  if (viewer.role === "MANAGER") {
    const led = new Set(ledTeamIds(viewer.userId, teams));
    const ids = new Set<string>([viewer.userId]);
    for (const m of members) if (m.teamId !== null && led.has(m.teamId)) ids.add(m.userId);
    return [...ids];
  }
  return [viewer.userId];
}

/** May the viewer open this rep's campaigns/detail pages? */
export function canViewRep(
  viewer: { userId: string; role: Role },
  repUserId: string,
  teams: TeamLite[],
  members: MemberLite[]
): boolean {
  return viewableUserIds(viewer, teams, members).includes(repUserId);
}

/** May the viewer add/remove a member to/from this team? */
export function canManageTeamMembership(
  viewer: { userId: string; role: Role },
  teamId: string,
  teams: TeamLite[]
): boolean {
  if (viewer.role === "ADMIN") return true;
  if (viewer.role === "MANAGER") return ledTeamIds(viewer.userId, teams).includes(teamId);
  return false;
}

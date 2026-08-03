export interface HierarchyTeam {
  teamId: string;
  parentTeamId?: string | null;
  leadUserId: string | null;
  name?: string;
}

/** All descendants of one or more teams. Invalid legacy cycles terminate
 * safely because each team is visited at most once. */
export function descendantTeamIds(
  rootIds: Iterable<string>,
  teams: HierarchyTeam[]
): Set<string> {
  const visible = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const team of teams) {
      if (
        team.parentTeamId != null &&
        visible.has(team.parentTeamId) &&
        !visible.has(team.teamId)
      ) {
        visible.add(team.teamId);
        changed = true;
      }
    }
  }
  return visible;
}

export function managedTeamIds(userId: string, teams: HierarchyTeam[]): Set<string> {
  return descendantTeamIds(
    teams.filter((team) => team.leadUserId === userId).map((team) => team.teamId),
    teams
  );
}

export function wouldCreateTeamCycle(
  teamId: string,
  parentTeamId: string | null,
  teams: HierarchyTeam[]
): boolean {
  if (parentTeamId === null) return false;
  if (parentTeamId === teamId) return true;
  const parentById = new Map(teams.map((team) => [team.teamId, team.parentTeamId ?? null]));
  const visited = new Set<string>([teamId]);
  let cursor: string | null = parentTeamId;
  while (cursor !== null) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

/** Parent-first order and indentation depth for the team page. Orphans and
 * any malformed legacy cycles are still returned once at the root level. */
export function orderTeamsByHierarchy<T extends HierarchyTeam>(
  teams: T[]
): Array<{ team: T; depth: number }> {
  const byParent = new Map<string | null, T[]>();
  for (const team of teams) {
    const parent = teams.some((candidate) => candidate.teamId === team.parentTeamId)
      ? (team.parentTeamId ?? null)
      : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), team]);
  }
  for (const rows of byParent.values()) {
    rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }

  const result: Array<{ team: T; depth: number }> = [];
  const visited = new Set<string>();
  function visit(parent: string | null, depth: number) {
    for (const team of byParent.get(parent) ?? []) {
      if (visited.has(team.teamId)) continue;
      visited.add(team.teamId);
      result.push({ team, depth });
      visit(team.teamId, depth + 1);
    }
  }
  visit(null, 0);
  for (const team of teams) {
    if (!visited.has(team.teamId)) {
      visited.add(team.teamId);
      result.push({ team, depth: 0 });
    }
  }
  return result;
}

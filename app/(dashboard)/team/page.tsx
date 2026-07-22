import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { statsForReps, type RepStats } from "@/lib/teams/stats";
import { ledTeamIds } from "@/lib/teams/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { TeamManager, RosterActions, RemoveFromTeamButton } from "@/components/team/TeamManager";
import type { Member, Team } from "@/schemas/user";
import { formatPercent } from "@/lib/analytics/metrics";


function KpiTiles({ stats }: { stats: RepStats[] }) {
  const sent = stats.reduce((a, s) => a + s.sent, 0);
  const replies = stats.reduce((a, s) => a + s.replies, 0);
  const bounces = stats.reduce((a, s) => a + s.bounces, 0);
  const active = stats.filter((s) => s.activeCampaigns > 0).length;
  const tiles = [
    ["Emails sent", String(sent)],
    ["Replies", String(replies)],
    ["Reply rate", sent > 0 ? formatPercent((replies / sent) * 100) : "—"],
    ["Reps sending now", String(active)],
    ["Bounces", String(bounces)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map(([label, value]) => (
        <div key={label} className="card p-4">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({
  rows,
  teamId,
  canManage,
}: {
  rows: Array<{ member: Member; stats: RepStats }>;
  teamId: string | null;
  canManage: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.stats.replyRate - a.stats.replyRate || b.stats.sent - a.stats.sent);
  return (
    <div className="overflow-x-auto card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Rep</th>
            <th className="px-4 py-3">Campaigns</th>
            <th className="px-4 py-3">Sent</th>
            <th className="px-4 py-3">Replies</th>
            <th className="px-4 py-3 min-w-36">Reply rate</th>
            <th className="px-4 py-3">Last activity</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-4 text-sm text-slate-500">
                No reps on this team yet.
              </td>
            </tr>
          ) : (
            sorted.map(({ member: m, stats: s }, i) => (
              <tr key={m.userId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  {i === 0 && s.sent > 0 && <span aria-hidden>🏆 </span>}
                  {m.email}
                  {!m.active && <span className="ml-2 badge bg-slate-200 text-slate-600">disabled</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {s.campaigns}
                  {s.activeCampaigns > 0 && (
                    <span className="ml-1 text-xs text-green-600">({s.activeCampaigns} live)</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{s.sent}</td>
                <td className="px-4 py-3 tabular-nums">{s.replies}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.min(100, s.replyRate)}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs text-slate-500">
                      {s.sent > 0 ? formatPercent(s.replyRate) : "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {s.lastActivityAt ? <LocalTime value={s.lastActivityAt} /> : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/team/${m.userId}`} className="text-xs font-medium text-primary hover:underline">
                      View →
                    </Link>
                    {canManage && teamId && (
                      <RemoveFromTeamButton teamId={teamId} userId={m.userId} email={m.email} />
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function TeamPage() {
  const ctx = await requireUser();
  if (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") redirect("/home");

  const [teams, members] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);

  const isAdmin = ctx.role === "ADMIN";
  const led = new Set(ledTeamIds(ctx.userId, teams));
  const visibleTeams: Team[] = isAdmin ? teams : teams.filter((t) => led.has(t.teamId));

  // Stats only for members we'll actually display.
  const visibleMemberIds = isAdmin
    ? members.map((m) => m.userId)
    : members.filter((m) => m.teamId !== null && led.has(m.teamId!)).map((m) => m.userId);
  const stats = await statsForReps(ctx.organizationId, visibleMemberIds);
  const rowsFor = (list: Member[]) =>
    list.map((m) => ({ member: m, stats: stats.get(m.userId)! })).filter((r) => r.stats);

  const memberOptions = members
    .filter((m) => m.active)
    .map((m) => ({ userId: m.userId, email: m.email, role: m.role, teamId: m.teamId }));
  const unassigned = members.filter((m) => m.teamId === null);
  const emailById = new Map(members.map((m) => [m.userId, m.email]));

  return (
    <div>
      <PageHeader
        title="Team"
        description={
          isAdmin
            ? "Every team's performance, plus team setup. Reps only ever see their own data."
            : "Your team's performance. Add or remove reps — their data stays their own."
        }
      />

      {isAdmin && (
        <div className="mb-6">
          <TeamManager
            teams={teams.map((t) => ({ teamId: t.teamId, name: t.name, leadUserId: t.leadUserId }))}
            members={memberOptions}
          />
        </div>
      )}

      {visibleTeams.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {isAdmin
            ? "No teams yet — create the first one above."
            : "You're not leading a team yet. Ask your administrator to make you the lead of a team."}
        </div>
      ) : (
        <div className="space-y-10">
          {visibleTeams.map((team) => {
            const roster = members.filter((m) => m.teamId === team.teamId);
            const canManage = isAdmin || led.has(team.teamId);
            const assignable = memberOptions.filter(
              (m) => m.teamId !== team.teamId && (isAdmin || m.teamId === null)
            );
            return (
              <section key={team.teamId}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{team.name}</h2>
                    <p className="text-xs text-slate-500">
                      Lead: {team.leadUserId ? (emailById.get(team.leadUserId) ?? "—") : "none yet"} ·{" "}
                      {roster.length} rep{roster.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && <RosterActions teamId={team.teamId} assignable={assignable} />}
                </div>
                <div className="mb-3">
                  <KpiTiles stats={rowsFor(roster).map((r) => r.stats)} />
                </div>
                <Leaderboard rows={rowsFor(roster)} teamId={team.teamId} canManage={canManage} />
              </section>
            );
          })}

          {isAdmin && unassigned.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Not on a team</h2>
              <p className="mb-3 text-xs text-slate-500">
                Use “Add a rep…” on a team above to place them.
              </p>
              <Leaderboard rows={rowsFor(unassigned)} teamId={null} canManage={false} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

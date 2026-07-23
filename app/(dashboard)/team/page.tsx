import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { getUser } from "@/lib/repositories/users";
import { statsForReps, type RepStats } from "@/lib/teams/stats";
import { ledTeamIds } from "@/lib/teams/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/home/CountUp";
import { TeamManager, RosterActions, RemoveFromTeamButton } from "@/components/team/TeamManager";
import type { Member, Team } from "@/schemas/user";
import { formatPercent } from "@/lib/analytics/metrics";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const RANK = ["🥇", "🥈", "🥉"];

function KpiTiles({ stats }: { stats: RepStats[] }) {
  const sent = stats.reduce((a, s) => a + s.sent, 0);
  const replies = stats.reduce((a, s) => a + s.replies, 0);
  const bounces = stats.reduce((a, s) => a + s.bounces, 0);
  const active = stats.filter((s) => s.activeCampaigns > 0).length;
  const replyRate = sent > 0 ? (replies / sent) * 100 : 0;

  const tiles: Array<{
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    icon: IconName;
    ring: string;
    accent: string;
  }> = [
    { label: "Emails sent", value: sent, icon: "mail", ring: "bg-primary-soft text-primary", accent: "text-slate-900" },
    { label: "Replies", value: replies, icon: "reply", ring: "bg-green-100 text-green-600", accent: "text-green-600" },
    { label: "Reply rate", value: replyRate, decimals: 1, suffix: "%", icon: "chart", ring: "bg-indigo-100 text-indigo-600", accent: "text-indigo-600" },
    { label: "Reps sending now", value: active, icon: "rocket", ring: "bg-primary-soft text-primary", accent: "text-primary" },
    { label: "Bounces", value: bounces, icon: "alert", ring: "bg-amber-100 text-amber-600", accent: bounces > 0 ? "text-amber-600" : "text-slate-900" },
  ];

  return (
    <div className="stagger grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">{t.label}</p>
            <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.ring}`}>
              <Icon name={t.icon} size={15} />
            </span>
          </div>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${t.accent}`}>
            <CountUp value={t.value} decimals={t.decimals} suffix={t.suffix} />
          </p>
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
  rows: Array<{ member: Member; stats: RepStats; name: string }>;
  teamId: string | null;
  canManage: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.stats.replyRate - a.stats.replyRate || b.stats.sent - a.stats.sent);
  const topRate = Math.max(1, ...sorted.map((r) => r.stats.replyRate));

  if (sorted.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">No reps on this team yet.</div>;
  }

  return (
    <div className="card divide-y divide-border overflow-hidden">
      {sorted.map(({ member: m, stats: s, name }, i) => {
        const display = name || m.email;
        const ranked = s.sent > 0 && i < 3;
        return (
          <div key={m.userId} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
            {/* Rank / avatar */}
            <div className="relative shrink-0">
              <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm">
                {initials(display)}
              </div>
              {ranked && (
                <span aria-hidden className="absolute -right-1 -top-1 text-sm">{RANK[i]}</span>
              )}
            </div>

            {/* Identity + engagement */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{display}</p>
                {!m.active && <span className="badge bg-slate-200 text-slate-600">disabled</span>}
                {s.activeCampaigns > 0 && (
                  <span className="live-dot inline-flex items-center gap-1 text-xs font-medium text-green-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> live
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-500">
                {s.sent} sent · {s.replies} replies · {s.campaigns} campaign{s.campaigns === 1 ? "" : "s"}
                {s.lastActivityAt && (
                  <> · <LocalTime value={s.lastActivityAt} /></>
                )}
              </p>
              {/* Reply-rate bar (scaled to the top performer) */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="brand-gradient h-full rounded-full"
                    style={{ width: `${s.sent > 0 ? Math.max(4, (s.replyRate / topRate) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
                  {s.sent > 0 ? formatPercent(s.replyRate) : "—"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Link href={`/team/${m.userId}`} className="text-xs font-medium text-primary hover:underline">
                View →
              </Link>
              {canManage && teamId && (
                <RemoveFromTeamButton teamId={teamId} userId={m.userId} email={m.email} />
              )}
            </div>
          </div>
        );
      })}
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
  const [stats, userDocs] = await Promise.all([
    statsForReps(ctx.organizationId, visibleMemberIds),
    Promise.all(members.map((m) => getUser(m.userId))),
  ]);
  const nameById = new Map(
    userDocs.filter((u) => u !== null).map((u) => [u.userId, u.displayName] as const)
  );
  const rowsFor = (list: Member[]) =>
    list
      .map((m) => ({ member: m, stats: stats.get(m.userId)!, name: nameById.get(m.userId) ?? "" }))
      .filter((r) => r.stats);

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

import Link from "next/link";
import { Meter } from "@/components/ui/charts/Meter";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { getUser } from "@/lib/repositories/users";
import { statsForReps, type RepStats } from "@/lib/teams/stats";
import { managedTeamIds, orderTeamsByHierarchy } from "@/lib/teams/hierarchy";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid, type StatTone } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
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
    tone: StatTone;
  }> = [
    { label: "Emails sent", value: sent, icon: "mail", tone: "default" },
    { label: "Replies", value: replies, icon: "reply", tone: replies > 0 ? "revenue" : "default" },
    { label: "Reply rate", value: replyRate, decimals: 1, suffix: "%", icon: "chart", tone: "success" },
    { label: "Reps sending now", value: active, icon: "rocket", tone: "primary" },
    { label: "Bounces", value: bounces, icon: "alert", tone: bounces > 0 ? "warning" : "default" },
  ];

  return (
    <StatGrid columns={5}>
      {tiles.map((t) => (
        <StatTile
          key={t.label}
          label={t.label}
          icon={t.icon}
          tone={t.tone}
          size="sm"
          value={<CountUp value={t.value} decimals={t.decimals} suffix={t.suffix} />}
        />
      ))}
    </StatGrid>
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
    return (
      <EmptyState
        variant="inline"
        icon="users"
        title="No reps on this team yet"
        description="Assign someone to this team and their sends, replies, and reply rate show up right here."
      />
    );
  }

  return (
    <div className="card divide-y divide-border overflow-hidden">
      {sorted.map(({ member: m, stats: s, name }, i) => {
        const display = name || m.email;
        const ranked = s.sent > 0 && i < 3;
        return (
          <div key={m.userId} className="flex items-center gap-3 p-4 transition hover:bg-surface-2">
            {/* Rank / avatar */}
            <div className="relative shrink-0">
              <div className="bg-surface-2 text-foreground flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-brand-contrast shadow-sm">
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
                {!m.active && <span className="badge bg-border text-muted">disabled</span>}
                {s.activeCampaigns > 0 && (
                  <span className="live-dot inline-flex items-center gap-1 text-xs font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> live
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">
                {s.sent} sent · {s.replies} replies · {s.campaigns} campaign{s.campaigns === 1 ? "" : "s"}
                {s.lastActivityAt && (
                  <> · <LocalTime value={s.lastActivityAt} /></>
                )}
              </p>
              {/* Reply-rate bar (scaled to the top performer) */}
              <div className="mt-2 flex items-center gap-2">
                <Meter
                  value={s.sent > 0 ? Math.max(4, (s.replyRate / topRate) * 100) : 0}
                  className="flex-1"
                />
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
                  {s.sent > 0 ? formatPercent(s.replyRate) : "Not available"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Link href={`/team/${m.userId}`} className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
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
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).teams
  ) {
    redirect("/home");
  }

  const [teams, members] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);

  const isAdmin = ctx.role === "ADMIN";
  const managed = managedTeamIds(ctx.userId, teams);
  const visibleTeams: Team[] = isAdmin ? teams : teams.filter((t) => managed.has(t.teamId));

  // Stats only for members we'll actually display.
  const visibleMemberIds = isAdmin
    ? members.map((m) => m.userId)
    : members.filter((m) => m.teamId !== null && managed.has(m.teamId!)).map((m) => m.userId);
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
            : "Your team's performance. Add or remove reps: their data stays their own."
        }
      />

      {isAdmin && (
        <div className="mb-6">
          <TeamManager
            teams={teams.map((t) => ({
              teamId: t.teamId,
              name: t.name,
              leadUserId: t.leadUserId,
              parentTeamId: t.parentTeamId,
            }))}
            members={memberOptions}
          />
        </div>
      )}

      {visibleTeams.length === 0 ? (
        <EmptyState
          icon="team"
          title={isAdmin ? "No teams yet" : "You are not leading a team yet"}
          description={
            isAdmin
              ? "Create your first team above, then assign reps to it. Team leads see their reps' numbers side by side."
              : "Ask your administrator to make you the lead of a team, and your reps' numbers will show up here."
          }
        />
      ) : (
        <div className="space-y-10">
          {orderTeamsByHierarchy(visibleTeams).map(({ team, depth }) => {
            const roster = members.filter((m) => m.teamId === team.teamId);
            const canManage = isAdmin || managed.has(team.teamId);
            const assignable = memberOptions.filter(
              (m) => m.teamId !== team.teamId && (isAdmin || m.teamId === null)
            );
            return (
              <section key={team.teamId} className={depth > 0 ? "border-l border-border pl-3 sm:pl-6" : ""}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {depth > 0 && <span aria-hidden className="mr-2 text-muted">↳</span>}
                      {team.name}
                    </h2>
                    <p className="text-xs text-muted">
                      Lead: {team.leadUserId ? (emailById.get(team.leadUserId) ?? "Not available") : "none yet"} ·{" "}
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
              <p className="mb-3 text-xs text-muted">
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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { canViewRep } from "@/lib/teams/access";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { LocalTime } from "@/components/LocalTime";
import { formatPercent } from "@/lib/analytics/metrics";


/**
 * Team Lead / Admin drill-down into one rep's campaigns. Access is checked
 * server-side against team membership — a lead can only open reps on teams
 * they lead; reps can never open this page for anyone but themselves.
 */
export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const ctx = await requireUser();
  if (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") redirect("/home");
  const { userId } = await params;

  const [teams, members] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);
  const memberLites = members.map((m) => ({ userId: m.userId, teamId: m.teamId }));
  if (!canViewRep({ userId: ctx.userId, role: ctx.role }, userId, teams, memberLites)) {
    redirect("/team");
  }
  const rep = members.find((m) => m.userId === userId);
  if (!rep) notFound();

  const campaigns = await listCampaigns({ userId, organizationId: ctx.organizationId }, 200);
  const sent = campaigns.reduce((a, c) => a + c.sentCount + c.followupSentCount, 0);
  const replies = campaigns.reduce((a, c) => a + c.replyCount, 0);
  const bounces = campaigns.reduce((a, c) => a + c.bounceCount, 0);
  const team = teams.find((t) => t.teamId === rep.teamId);

  const tiles = [
    ["Campaigns", String(campaigns.length)],
    ["Emails sent", String(sent)],
    ["Replies", String(replies)],
    ["Reply rate", sent > 0 ? formatPercent((replies / sent) * 100) : "—"],
    ["Bounces", String(bounces)],
  ];

  return (
    <div>
      <Link href="/team" className="text-sm text-slate-500 hover:underline">
        ← Team
      </Link>
      <div className="mt-2">
        <h1 className="text-2xl font-semibold">{rep.email}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {team ? `Team ${team.name}` : "Not on a team"} · {rep.role === "ADMIN" ? "Administrator" : rep.role === "MANAGER" ? "Team Lead" : "Sales Rep"}
          {!rep.active && " · account disabled"}
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 font-medium">Campaigns</h2>
      {campaigns.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No campaigns yet.</div>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Replies</th>
                <th className="px-4 py-3">Reply rate</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const badge = CAMPAIGN_STATUS_LABELS[c.status] ?? {
                  label: c.status,
                  className: "bg-slate-100 text-slate-600",
                };
                const cSent = c.sentCount + c.followupSentCount;
                return (
                  <tr key={c.campaignId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{cSent}</td>
                    <td className="px-4 py-3 tabular-nums">{c.replyCount}</td>
                    <td className="px-4 py-3 tabular-nums text-xs text-slate-500">
                      {cSent > 0 ? formatPercent((c.replyCount / cSent) * 100) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <LocalTime value={c.updatedAt} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/team/${userId}/campaigns/${c.campaignId}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

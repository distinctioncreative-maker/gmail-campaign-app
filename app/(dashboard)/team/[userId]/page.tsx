import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { canViewRep } from "@/lib/teams/access";
import { getUser } from "@/lib/repositories/users";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { LocalTime } from "@/components/LocalTime";
import { formatPercent } from "@/lib/analytics/metrics";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { campaignsIncludedInWorkspaceStats } from "@/lib/campaigns/lifecycle";


/**
 * Team Lead / Admin drill-down into one rep's campaigns. Access is checked
 * server-side against team membership: a lead can only open reps on teams
 * they lead; reps can never open this page for anyone but themselves.
 */
export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const ctx = await requireUser();
  if (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") redirect("/home");
  const settings = await getOrgSettings(ctx.organizationId);
  if (!capabilitiesFor(ctx.tenantType, settings.billing.plan).teams) redirect("/home");
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

  const [repUser, allCampaigns] = await Promise.all([
    getUser(userId),
    listCampaigns({ userId, organizationId: ctx.organizationId }, 200),
  ]);
  const campaigns = campaignsIncludedInWorkspaceStats(allCampaigns);
  const repName = repUser?.displayName || rep.email;
  const sent = campaigns.reduce((a, c) => a + c.sentCount + c.followupSentCount, 0);
  const replies = campaigns.reduce((a, c) => a + c.replyCount, 0);
  const bounces = campaigns.reduce((a, c) => a + c.bounceCount, 0);
  const team = teams.find((t) => t.teamId === rep.teamId);

  const tiles = [
    ["Campaigns", String(campaigns.length)],
    ["Emails sent", String(sent)],
    ["Replies", String(replies)],
    ["Reply rate", sent > 0 ? formatPercent((replies / sent) * 100) : "Not available"],
    ["Bounces", String(bounces)],
  ];

  return (
    <div>
      <PageHeader
        title={repName}
        description={[
          repName !== rep.email ? rep.email : null,
          team ? `Team ${team.name}` : "Not on a team",
          rep.role === "ADMIN" ? "Administrator" : rep.role === "MANAGER" ? "Team Lead" : "Sales Rep",
          !rep.active ? "account disabled" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        backHref="/team"
        backLabel="Team"
      />

      <div className="mt-6">
        <StatGrid columns={5}>
          {tiles.map(([label, value]) => (
            <StatTile
              key={label}
              label={label}
              value={value}
              size="sm"
              tone={label === "Replies" && replies > 0 ? "revenue" : "default"}
            />
          ))}
        </StatGrid>
      </div>

      <h2 className="mt-8 mb-3 font-medium">Campaigns</h2>
      {campaigns.length === 0 ? (
        <EmptyState
          variant="inline"
          icon="rocket"
          title="No campaigns yet"
          description={`${repName} has not launched a campaign. Their results will appear here once they do.`}
        />
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
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
                  className: "bg-surface-2 text-muted",
                };
                const cSent = c.sentCount + c.followupSentCount;
                return (
                  <tr key={c.campaignId} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{cSent}</td>
                    <td className="px-4 py-3 tabular-nums">{c.replyCount}</td>
                    <td className="px-4 py-3 tabular-nums text-xs text-muted">
                      {cSent > 0 ? formatPercent((c.replyCount / cSent) * 100) : "Not available"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <LocalTime value={c.updatedAt} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/team/${userId}/campaigns/${c.campaignId}`}
                        className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
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

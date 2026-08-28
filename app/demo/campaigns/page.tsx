import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { CountUp } from "@/components/ui/CountUp";
import { DataTable, TableRow } from "@/components/ui/DataTable";
import { LocalTime } from "@/components/LocalTime";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { campaignPerformance, formatPercent, totalSent } from "@/lib/analytics/metrics";
import { DEMO_CAMPAIGNS } from "@/lib/demo/fixtures";
import { VariationPanel } from "@/components/demo/VariationPanel";

export default function DemoCampaignsPage() {
  const active = DEMO_CAMPAIGNS.filter((c) =>
    ["READY", "PREPARING", "ACTIVE", "PAUSED"].includes(c.status)
  ).length;
  const drafts = DEMO_CAMPAIGNS.filter((c) => c.status === "DRAFT").length;
  const replies = DEMO_CAMPAIGNS.reduce((n, c) => n + c.replyCount, 0);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Every campaign, its pace, and what it has produced."
      />

      <StatGrid columns={4}>
        <StatTile label="In progress" value={<CountUp value={active} />} icon="rocket" tone="primary" size="sm" hint="Ready, sending, or paused" />
        <StatTile label="Drafts" value={<CountUp value={drafts} />} icon="edit" size="sm" hint="Not launched" />
        <StatTile label="Replies" value={<CountUp value={replies} />} icon="reply" tone="revenue" size="sm" hint="Conversations started" />
        <StatTile label="Needs attention" value={<CountUp value={0} />} icon="alert" size="sm" hint="No active issues" />
      </StatGrid>

      <DataTable
        className="card mt-8"
        minWidth="860px"
        head={
          <>
            <th className="px-4 py-3">Campaign</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Progress</th>
            <th className="px-4 py-3">Sent</th>
            <th className="px-4 py-3">Replies</th>
            <th className="px-4 py-3">Reply rate</th>
            <th className="px-4 py-3">Updated</th>
          </>
        }
      >
            {DEMO_CAMPAIGNS.map((c) => {
              const badge = CAMPAIGN_STATUS_LABELS[c.status];
              const perf = campaignPerformance(c);
              const pct = c.eligibleRecipients > 0
                ? Math.min(100, (c.sentCount / c.eligibleRecipients) * 100) : 0;
              return (
                <TableRow key={c.campaignId}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3"><span className={`badge ${badge.className}`}>{badge.label}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{totalSent(c).toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{c.replyCount.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{formatPercent(perf.replyRate)}</td>
                  <td className="px-4 py-3 text-xs text-muted"><LocalTime value={c.updatedAt} /></td>
                </TableRow>
              );
            })}
      </DataTable>

      {/* A visitor could previously walk the entire tour without learning that
          Cadence varies the wording per recipient, which is one of the few
          things that genuinely distinguish it. */}
      <VariationPanel />
    </div>
  );
}

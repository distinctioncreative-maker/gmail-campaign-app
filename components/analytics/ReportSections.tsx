import Link from "next/link";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { formatDuration, formatPercent } from "@/lib/analytics/metrics";
import type {
  FunnelStep,
  LeaderboardRow,
  ReportData,
  ReportTotals,
} from "@/lib/analytics/report";

/**
 * The presentational half of the Reports page. Each section takes exactly the
 * slice of ReportData it draws, so a change to one panel cannot quietly reach
 * into another the way it could when all of this lived in one 400-line return.
 */

export function ReportScopeBar({
  scopeName,
  campaignCount,
  activeCount,
  rangeDays,
}: {
  scopeName: string;
  campaignCount: number;
  activeCount: number;
  rangeDays: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Reporting scope</p>
        <h2 className="mt-0.5 text-lg font-semibold text-foreground">{scopeName}</h2>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full border border-border bg-surface px-3 py-1.5">
          {campaignCount} campaign{campaignCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5">
          {activeCount} sending now
        </span>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5">
          {rangeDays}-day analysis
        </span>
      </div>
    </div>
  );
}

export function ReportKpis({
  totals,
  ttr,
  rangeDays,
}: {
  totals: ReportTotals;
  ttr: ReportData["ttr"];
  rangeDays: number;
}) {
  const rate = (count: number) => (totals.sent > 0 ? (count / totals.sent) * 100 : 0);
  const unavailable = <span className="text-xl text-muted">Not available</span>;

  return (
    <StatGrid columns={6}>
      <StatTile
        label="Total sends"
        value={<CountUp value={totals.sent} />}
        hint={`${totals.initialSent.toLocaleString()} initial, ${totals.followups.toLocaleString()} follow-ups`}
        icon="mail"
        size="sm"
      />
      <StatTile
        label="Replies"
        value={<CountUp value={totals.replies} />}
        hint="Conversations your list has started"
        icon="reply"
        tone={totals.replies > 0 ? "revenue" : "default"}
        size="sm"
      />
      <StatTile
        label="Reply rate"
        value={
          totals.sent > 0 ? (
            <CountUp value={rate(totals.replies)} decimals={1} suffix="%" />
          ) : (
            unavailable
          )
        }
        hint="Replies divided by total sends"
        icon="chart"
        tone="success"
        size="sm"
      />
      <StatTile
        label="Bounce rate"
        value={
          totals.sent > 0 ? (
            <CountUp value={rate(totals.bounces)} decimals={1} suffix="%" />
          ) : (
            unavailable
          )
        }
        hint={`${totals.bounces.toLocaleString()} detected bounces`}
        icon="alert"
        tone={rate(totals.bounces) > 3 ? "danger" : "default"}
        size="sm"
      />
      <StatTile
        label="Unsubscribes"
        value={<CountUp value={totals.unsubscribes} />}
        hint={
          totals.sent > 0
            ? `${formatPercent(rate(totals.unsubscribes))} of sends`
            : "No sends yet"
        }
        icon="ban"
        tone={totals.unsubscribes > 0 ? "warning" : "default"}
        size="sm"
      />
      <StatTile
        label="Median reply time"
        value={formatDuration(ttr.medianMs)}
        hint={`Leads first sent in the last ${rangeDays} days`}
        icon="hourglass"
        size="sm"
      />
    </StatGrid>
  );
}

export function BestCampaignCallout({ best }: { best: LeaderboardRow }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4 text-sm text-foreground">
      <span className="mt-0.5 rounded-lg bg-surface p-1.5">
        <Icon name="chart" size={17} />
      </span>
      <div>
        <p className="font-medium">Best performer</p>
        <p className="mt-0.5">
          <Link
            href={`/campaigns/${best.campaign.campaignId}`}
            className="font-medium underline decoration-primary/30 underline-offset-2"
          >
            {best.campaign.name}
          </Link>{" "}
          leads this view at {formatPercent(best.performance.replyRate)} across{" "}
          {best.performance.sent.toLocaleString()} sends.
        </p>
      </div>
    </div>
  );
}

export function CampaignFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold">Campaign funnel</h2>
      <p className="mt-1 text-xs text-muted">
        Initial-send progress and reply outcomes. Follow-ups stay in the total sends KPI above.
      </p>
      <div className="mt-5 space-y-4">
        {steps.map((step) => (
          <div key={step.label}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{step.label}</p>
                <p className="text-xs text-muted">{step.detail}</p>
              </div>
              <p className="display-figure text-xl">
                {step.value.toLocaleString()}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.max(step.value > 0 ? 3 : 0, (step.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TimeToReplyPanel({ ttr }: { ttr: ReportData["ttr"] }) {
  const buckets: Array<[string, number]> = [
    ["Within 1 hour", ttr.buckets.under1h],
    ["Within 1 day", ttr.buckets.under1d],
    ["Within 3 days", ttr.buckets.under3d],
    ["Later", ttr.buckets.later],
  ];
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold">Time to reply</h2>
      <p className="mb-4 mt-1 text-xs text-muted">
        {ttr.count > 0
          ? `Based on ${ttr.count} lead${ttr.count === 1 ? "" : "s"} first sent in this period.`
          : "No replies from this send cohort yet."}
      </p>
      {ttr.count > 0 ? (
        <div className="space-y-3">
          {buckets.map(([label, count]) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-muted">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(count / ttr.count) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">{count}</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted">
            Average reply time: {formatDuration(ttr.averageMs)}.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function TrackedEngagementPanel({
  trackedCampaignCount,
  tracking,
}: {
  trackedCampaignCount: number;
  tracking: ReportData["tracking"];
}) {
  const unavailable = <span className="text-xl text-muted">Not available</span>;
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold">Tracked engagement</h2>
      {trackedCampaignCount === 0 ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-medium">Tracking is off in this view</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Open and click tracking is optional and disabled by default because pixels and
            rewritten links can affect deliverability. Replies remain the primary performance
            signal.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            {trackedCampaignCount} tracked campaign{trackedCampaignCount === 1 ? "" : "s"} and{" "}
            {tracking.sent.toLocaleString()} sends in this cohort.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-[0.8125rem] font-medium leading-tight text-muted">Open detected</p>
              <p className="mt-2.5 display-figure text-2xl leading-none text-foreground">
                {tracking.sent > 0 ? (
                  <CountUp value={tracking.openRate} decimals={1} suffix="%" />
                ) : (
                  unavailable
                )}
              </p>
              <p className="mt-2 text-xs text-muted">
                {tracking.opened.toLocaleString()} pixel loads
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-[0.8125rem] font-medium leading-tight text-muted">Click rate</p>
              <p className="mt-2.5 display-figure text-2xl leading-none text-revenue">
                {tracking.sent > 0 ? (
                  <CountUp value={tracking.clickRate} decimals={1} suffix="%" />
                ) : (
                  unavailable
                )}
              </p>
              <p className="mt-2 text-xs text-muted">
                {tracking.clicked.toLocaleString()} unique clickers
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Email clients can preload images, so an open detection is a directional signal rather
            than proof that a person read the message.
          </p>
        </>
      )}
    </section>
  );
}

export function CampaignLeaderboard({
  rows,
  rangeDays,
  isScopedToOne,
  showFilterHint,
}: {
  rows: LeaderboardRow[];
  rangeDays: number;
  isScopedToOne: boolean;
  showFilterHint: boolean;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {isScopedToOne ? "Campaign performance" : "Compare campaigns"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            All-time outcomes ranked by reply rate, with at least one send.
          </p>
        </div>
        {showFilterHint ? (
          <p className="text-xs text-muted">Select a campaign above for its dedicated report.</p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="inline"
          icon="chart"
          title="No sends yet"
          description="Campaign results land here the moment your first message goes out."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total sends</th>
                <th className="px-4 py-3">Replies</th>
                <th className="min-w-44 px-4 py-3">Reply rate</th>
                <th className="px-4 py-3">Bounce rate</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ campaign, performance }) => {
                const badge = CAMPAIGN_STATUS_LABELS[campaign.status];
                return (
                  <tr
                    key={campaign.campaignId}
                    className="border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/reports?campaign=${campaign.campaignId}&range=${rangeDays}`}
                        className="hover:text-foreground"
                      >
                        {campaign.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {performance.sent.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {campaign.replyCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, performance.replyRate)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted">
                          {formatPercent(performance.replyRate)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPercent(performance.bounceRate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPercent(performance.progressRate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/campaigns/${campaign.campaignId}`}
                        className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

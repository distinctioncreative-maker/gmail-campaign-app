import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import {
  listCampaigns,
  listRecipients,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import {
  ReplyHeatmap,
  TrendChart,
  BestSendTimes,
} from "@/components/analytics/Charts";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";
import { ScanRepliesButton } from "@/components/analytics/ScanRepliesButton";
import {
  ReportFilters,
  type ReportCampaignOption,
} from "@/components/analytics/ReportFilters";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  timeToReply,
  replyHeatmap,
  bestSendTimes,
  dailyTrend,
  formatDuration,
  formatPercent,
  totalSent,
  campaignPerformance,
  openClickRates,
  recipientsSentSince,
  reportWindow,
  type RecipientPoint,
} from "@/lib/analytics/metrics";

// Recipient-level analysis is capped to keep the report responsive. Cached
// campaign counters remain exact across every campaign in the selected scope.
const MAX_CAMPAIGNS_SCANNED = 40;
const RANGE_OPTIONS = new Set([30, 90, 365]);

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string | string[];
    range?: string | string[];
  }>;
}) {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const tz = ctx.user.timezone;
  const params = await searchParams;

  const campaigns = await listCampaigns(owner, 200);
  const requestedCampaignId = stringParam(params.campaign);
  const selectedCampaign =
    campaigns.find((campaign) => campaign.campaignId === requestedCampaignId) ??
    null;
  const requestedRange = Number(stringParam(params.range));
  const rangeDays = RANGE_OPTIONS.has(requestedRange) ? requestedRange : 30;
  const reportCampaigns = selectedCampaign ? [selectedCampaign] : campaigns;

  const eligibleForScan = reportCampaigns.filter(
    (campaign) => campaign.sentCount > 0 || campaign.status === "ACTIVE"
  );
  const scanned = eligibleForScan.slice(0, MAX_CAMPAIGNS_SCANNED);
  const recipientLists = await Promise.all(
    scanned.map((campaign) => listRecipients(owner, campaign.campaignId))
  );
  const points: RecipientPoint[] = recipientLists.flat().map((recipient) => ({
    initialSentAt: recipient.initialSentAt,
    repliedAt: recipient.repliedAt,
    bouncedAt: recipient.bouncedAt,
    unsubscribedAt: recipient.unsubscribedAt,
  }));
  const window = reportWindow(rangeDays);
  const since = window.since;
  const periodPoints = recipientsSentSince(points, since);

  const ttr = timeToReply(periodPoints);
  const heat = replyHeatmap(periodPoints, tz);
  const best = bestSendTimes(periodPoints, tz).filter((row) => row.sent >= 2);
  const trend = dailyTrend(periodPoints, tz, rangeDays, window.now);

  const trackedScanned = scanned.filter((campaign) => campaign.trackingEnabled);
  const trackedPoints = recipientsSentSince(
    scanned.flatMap((campaign, index) =>
      campaign.trackingEnabled
        ? recipientLists[index].map((recipient) => ({
            initialSentAt: recipient.initialSentAt,
            repliedAt: recipient.repliedAt,
            bouncedAt: recipient.bouncedAt,
            unsubscribedAt: recipient.unsubscribedAt,
            openedAt: recipient.openedAt,
            firstClickedAt: recipient.firstClickedAt,
          }))
        : []
    ),
    since
  );
  const tracking = openClickRates(trackedPoints);

  const totalSentAll = reportCampaigns.reduce(
    (sum, campaign) => sum + totalSent(campaign),
    0
  );
  const initialSentAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.sentCount,
    0
  );
  const followupsAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.followupSentCount,
    0
  );
  const repliesAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.replyCount,
    0
  );
  const bouncesAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.bounceCount,
    0
  );
  const unsubscribesAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.unsubscribeCount,
    0
  );
  const eligibleAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.eligibleRecipients,
    0
  );
  const excludedAll = reportCampaigns.reduce(
    (sum, campaign) => sum + campaign.excludedRecipients,
    0
  );
  const rate = (count: number) =>
    totalSentAll > 0 ? (count / totalSentAll) * 100 : 0;

  const leaderboard = reportCampaigns
    .filter((campaign) => totalSent(campaign) > 0)
    .map((campaign) => ({
      campaign,
      performance: campaignPerformance(campaign),
    }))
    .sort(
      (a, b) =>
        b.performance.replyRate - a.performance.replyRate ||
        b.performance.sent - a.performance.sent
    );
  const bestCampaign = leaderboard[0] ?? null;
  const activeCount = reportCampaigns.filter(
    (campaign) => campaign.status === "ACTIVE"
  ).length;
  const scopeName = selectedCampaign?.name ?? "All campaigns";
  const scanIsCapped = eligibleForScan.length > scanned.length;

  const campaignOptions: ReportCampaignOption[] = campaigns.map((campaign) => ({
    campaignId: campaign.campaignId,
    name: campaign.name,
    statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status].label,
  }));

  const csvRows = leaderboard.map(({ campaign, performance }) => [
    campaign.name,
    CAMPAIGN_STATUS_LABELS[campaign.status].label,
    campaign.eligibleRecipients,
    performance.sent,
    campaign.replyCount,
    `${performance.replyRate.toFixed(1)}%`,
    campaign.bounceCount,
    `${performance.bounceRate.toFixed(1)}%`,
    campaign.unsubscribeCount,
  ]);

  const funnel = [
    {
      label: "Eligible leads",
      value: eligibleAll,
      detail: `${excludedAll.toLocaleString()} excluded by campaign rules`,
    },
    {
      label: "Initial emails sent",
      value: initialSentAll,
      detail:
        eligibleAll > 0
          ? `${Math.min(100, (initialSentAll / eligibleAll) * 100).toFixed(1)}% of eligible leads`
          : "No eligible leads yet",
    },
    {
      label: "Replies",
      value: repliesAll,
      detail:
        initialSentAll > 0
          ? `${((repliesAll / initialSentAll) * 100).toFixed(1)}% of contacted leads`
          : "No initial sends yet",
    },
  ];
  const funnelMax = Math.max(1, ...funnel.map((step) => step.value));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Campaign-level performance, reliable reply outcomes, and timing signals in one decision-ready view. Open and click data appears only for campaigns where tracking was enabled."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScanRepliesButton />
            {leaderboard.length > 0 ? (
              <ExportCsvButton
                filename="cadence-campaign-performance.csv"
                headers={[
                  "Campaign",
                  "Status",
                  "Eligible",
                  "Total sends",
                  "Replies",
                  "Reply rate",
                  "Bounces",
                  "Bounce rate",
                  "Unsubscribes",
                ]}
                rows={csvRows}
              />
            ) : null}
          </div>
        }
      />

      <ReportFilters
        campaigns={campaignOptions}
        selectedCampaignId={selectedCampaign?.campaignId ?? ""}
        rangeDays={rangeDays}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Reporting scope
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">
            {scopeName}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5">
            {reportCampaigns.length} campaign
            {reportCampaigns.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1.5">
            {activeCount} sending now
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1.5">
            {rangeDays}-day analysis
          </span>
        </div>
      </div>

      <StatGrid columns={6}>
        <StatTile
          label="Total sends"
          value={<CountUp value={totalSentAll} />}
          hint={`${initialSentAll.toLocaleString()} initial, ${followupsAll.toLocaleString()} follow-ups`}
          icon="mail"
          size="sm"
        />
        <StatTile
          label="Replies"
          value={<CountUp value={repliesAll} />}
          hint="Conversations your list has started"
          icon="reply"
          tone={repliesAll > 0 ? "revenue" : "default"}
          size="sm"
        />
        <StatTile
          label="Reply rate"
          value={
            totalSentAll > 0 ? (
              <CountUp value={rate(repliesAll)} decimals={1} suffix="%" />
            ) : (
              <span className="text-xl text-muted">Not available</span>
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
            totalSentAll > 0 ? (
              <CountUp value={rate(bouncesAll)} decimals={1} suffix="%" />
            ) : (
              <span className="text-xl text-muted">Not available</span>
            )
          }
          hint={`${bouncesAll.toLocaleString()} detected bounces`}
          icon="alert"
          tone={rate(bouncesAll) > 3 ? "danger" : "default"}
          size="sm"
        />
        <StatTile
          label="Unsubscribes"
          value={<CountUp value={unsubscribesAll} />}
          hint={
            totalSentAll > 0
              ? `${formatPercent(rate(unsubscribesAll))} of sends`
              : "No sends yet"
          }
          icon="ban"
          tone={unsubscribesAll > 0 ? "warning" : "default"}
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

      {bestCampaign ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-4 text-sm text-primary">
          <span className="mt-0.5 rounded-lg bg-surface p-1.5">
            <Icon name="chart" size={17} />
          </span>
          <div>
            <p className="font-semibold">Strongest reply performance</p>
            <p className="mt-0.5 text-primary/80">
              <Link
                href={`/campaigns/${bestCampaign.campaign.campaignId}`}
                className="font-medium underline decoration-primary/30 underline-offset-2"
              >
                {bestCampaign.campaign.name}
              </Link>{" "}
              leads this view at{" "}
              {formatPercent(bestCampaign.performance.replyRate)} across{" "}
              {bestCampaign.performance.sent.toLocaleString()} sends.
            </p>
          </div>
        </div>
      ) : null}

      {scanIsCapped ? (
        <p className="mt-3 text-xs text-muted">
          Timing charts analyze the {MAX_CAMPAIGNS_SCANNED} most recently
          updated campaigns with sends. Headline totals and the comparison
          table still include every campaign in this view.
        </p>
      ) : null}

      {/* Hero chart: effort in, conversations out, on one canvas. */}
      <section className="card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Outreach trend</h2>
            <p className="mt-1 text-xs text-muted">
              Initial sends and replies from the selected cohort over the last{" "}
              {rangeDays} days. Replies use their own scale so a strong day still
              stands out against send volume.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <TrendChart rows={trend} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Campaign funnel</h2>
          <p className="mt-1 text-xs text-muted">
            Initial-send progress and reply outcomes. Follow-ups stay in the
            total sends KPI above.
          </p>
          <div className="mt-5 space-y-4">
            {funnel.map((step) => (
              <div key={step.label}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted">{step.detail}</p>
                  </div>
                  <p className="font-display text-xl font-bold tabular-nums tracking-[-0.03em]">
                    {step.value.toLocaleString()}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full brand-gradient"
                    style={{
                      width: `${Math.max(
                        step.value > 0 ? 3 : 0,
                        (step.value / funnelMax) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">When replies arrive</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            Darker cells mean more replies in {tz}.
          </p>
          <ReplyHeatmap grid={heat} />
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Best send hours</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            Reply rate by the local hour the initial email was sent. Hours
            need at least two sends to appear.
          </p>
          <BestSendTimes rows={best} />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Time to reply</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            {ttr.count > 0
              ? `Based on ${ttr.count} lead${ttr.count === 1 ? "" : "s"} first sent in this period.`
              : "No replies from this send cohort yet."}
          </p>
          {ttr.count > 0 ? (
            <div className="space-y-3">
              {[
                ["Within 1 hour", ttr.buckets.under1h],
                ["Within 1 day", ttr.buckets.under1d],
                ["Within 3 days", ttr.buckets.under3d],
                ["Later", ttr.buckets.later],
              ].map(([label, count]) => (
                <div
                  key={label as string}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-28 shrink-0 text-muted">{label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${(Number(count) / ttr.count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted">
                    {count}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted/70">
                Average reply time: {formatDuration(ttr.averageMs)}.
              </p>
            </div>
          ) : null}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Tracked engagement</h2>
          {trackedScanned.length === 0 ? (
            <div className="mt-4 rounded-xl bg-surface-2 p-4">
              <p className="text-sm font-medium">Tracking is off in this view</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Open and click tracking is optional and disabled by default
                because pixels and rewritten links can affect deliverability.
                Replies remain the primary performance signal.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                {trackedScanned.length} tracked campaign
                {trackedScanned.length === 1 ? "" : "s"} and{" "}
                {tracking.sent.toLocaleString()} sends in this cohort.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="text-[0.8125rem] font-medium leading-tight text-muted">
                    Open detected
                  </p>
                  <p className="mt-2.5 font-display text-2xl font-bold leading-none tabular-nums tracking-[-0.03em] text-primary">
                    {tracking.sent > 0 ? (
                      <CountUp
                        value={tracking.openRate}
                        decimals={1}
                        suffix="%"
                      />
                    ) : (
                      <span className="text-xl text-muted">Not available</span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {tracking.opened.toLocaleString()} pixel loads
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="text-[0.8125rem] font-medium leading-tight text-muted">
                    Click rate
                  </p>
                  <p className="mt-2.5 font-display text-2xl font-bold leading-none tabular-nums tracking-[-0.03em] text-revenue">
                    {tracking.sent > 0 ? (
                      <CountUp
                        value={tracking.clickRate}
                        decimals={1}
                        suffix="%"
                      />
                    ) : (
                      <span className="text-xl text-muted">Not available</span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {tracking.clicked.toLocaleString()} unique clickers
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted/70">
                Email clients can preload images, so an open detection is a
                directional signal rather than proof that a person read the
                message.
              </p>
            </>
          )}
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              {selectedCampaign ? "Campaign performance" : "Compare campaigns"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              All-time outcomes ranked by reply rate, with at least one send.
            </p>
          </div>
          {!selectedCampaign && campaigns.length > 1 ? (
            <p className="text-xs text-muted">
              Select a campaign above for its dedicated report.
            </p>
          ) : null}
        </div>

        {leaderboard.length === 0 ? (
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
                {leaderboard.map(({ campaign, performance }) => {
                  const badge = CAMPAIGN_STATUS_LABELS[campaign.status];
                  return (
                    <tr
                      key={campaign.campaignId}
                      className="border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/reports?campaign=${campaign.campaignId}&range=${rangeDays}`}
                          className="hover:text-primary"
                        >
                          {campaign.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${badge.className}`}>
                          {badge.label}
                        </span>
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
                              className="h-full rounded-full bg-green-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  performance.replyRate
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-muted">
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
                          className="text-xs font-medium text-primary hover:underline"
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
    </div>
  );
}

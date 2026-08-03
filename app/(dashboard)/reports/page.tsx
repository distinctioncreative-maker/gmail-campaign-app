import { requireUser } from "@/lib/auth/requireUser";
import { ownerFromCtx } from "@/lib/repositories/campaigns";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { ReplyHeatmap, TrendChart, BestSendTimes } from "@/components/analytics/Charts";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";
import { ScanRepliesButton } from "@/components/analytics/ScanRepliesButton";
import {
  ReportFilters,
  type ReportCampaignOption,
} from "@/components/analytics/ReportFilters";
import {
  ReportScopeBar,
  ReportKpis,
  BestCampaignCallout,
  CampaignFunnel,
  TimeToReplyPanel,
  TrackedEngagementPanel,
  CampaignLeaderboard,
} from "@/components/analytics/ReportSections";
import {
  loadReport,
  resolveRangeDays,
  stringParam,
  MAX_CAMPAIGNS_SCANNED,
} from "@/lib/analytics/report";

/**
 * Reports composes prepared data into sections. Loading and aggregation live
 * in lib/analytics/report.ts; each panel lives in components/analytics.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string | string[]; range?: string | string[] }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;
  const rangeDays = resolveRangeDays(params.range);

  const report = await loadReport(ownerFromCtx(ctx), ctx.user.timezone, {
    campaignId: stringParam(params.campaign),
    rangeDays,
  });

  const campaignOptions: ReportCampaignOption[] = report.allCampaigns.map((campaign) => ({
    campaignId: campaign.campaignId,
    name: campaign.name,
    statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status].label,
  }));

  const csvRows = report.leaderboard.map(({ campaign, performance }) => [
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

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Campaign-level performance, reliable reply outcomes, and timing signals in one decision-ready view. Recently deleted campaigns stay recoverable but are excluded from these totals."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScanRepliesButton />
            {report.leaderboard.length > 0 ? (
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
        selectedCampaignId={report.selectedCampaign?.campaignId ?? ""}
        rangeDays={rangeDays}
      />

      <ReportScopeBar
        scopeName={report.selectedCampaign?.name ?? "All campaigns"}
        campaignCount={report.scopeCampaigns.length}
        activeCount={report.activeCount}
        rangeDays={rangeDays}
      />

      <ReportKpis totals={report.totals} ttr={report.ttr} rangeDays={rangeDays} />

      {report.best ? <BestCampaignCallout best={report.best} /> : null}

      {report.scanIsCapped ? (
        <p className="mt-3 text-xs text-muted">
          Timing charts analyze the {MAX_CAMPAIGNS_SCANNED} most recently updated campaigns with
          sends. Headline totals and the comparison table still include every campaign in this
          view.
        </p>
      ) : null}

      {/* Hero chart: effort in, conversations out, on one canvas. */}
      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="font-semibold">Outreach trend</h2>
        <p className="mt-1 text-xs text-muted">
          Initial sends and replies from the selected cohort over the last {rangeDays} days.
          Replies use their own scale so a strong day still stands out against send volume.
        </p>
        <div className="mt-5">
          <TrendChart rows={report.trend} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <CampaignFunnel steps={report.funnel} />

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">When replies arrive</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            Darker cells mean more replies in {ctx.user.timezone}.
          </p>
          <ReplyHeatmap grid={report.heatmap} />
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Best send hours</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            Reply rate by the local hour the initial email was sent. Hours need at least two sends
            to appear.
          </p>
          <BestSendTimes rows={report.bestHours} />
        </section>

        <TimeToReplyPanel ttr={report.ttr} />
      </div>

      <div className="mt-6">
        <TrackedEngagementPanel
          trackedCampaignCount={report.trackedCampaignCount}
          tracking={report.tracking}
        />
      </div>

      <CampaignLeaderboard
        rows={report.leaderboard}
        rangeDays={rangeDays}
        isScopedToOne={report.selectedCampaign !== null}
        showFilterHint={!report.selectedCampaign && report.allCampaigns.length > 1}
      />
    </div>
  );
}

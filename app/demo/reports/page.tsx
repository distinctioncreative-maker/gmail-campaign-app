import { PageHeader } from "@/components/ui/PageHeader";
import { ReplyHeatmap, TrendChart, BestSendTimes } from "@/components/analytics/Charts";
import {
  ReportScopeBar,
  ReportKpis,
  OutcomesPanel,
  BestCampaignCallout,
  CampaignFunnel,
  TimeToReplyPanel,
  InboxBreakdownPanel,
  TrackedEngagementPanel,
} from "@/components/analytics/ReportSections";
import { demoReport } from "@/lib/demo/fixtures";

export default function DemoReportsPage() {
  const report = demoReport(30);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Campaign performance, reply outcomes, and timing signals in one decision-ready view."
      />

      <ReportScopeBar
        scopeName="All campaigns"
        campaignCount={report.scopeCampaigns.length}
        activeCount={report.activeCount}
        rangeDays={report.rangeDays}
      />

      <ReportKpis totals={report.totals} ttr={report.ttr} rangeDays={report.rangeDays} />

      <OutcomesPanel totals={report.totals} />

      {report.best ? <BestCampaignCallout best={report.best} /> : null}

      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="font-semibold">Outreach trend</h2>
        <p className="mt-1 text-xs text-muted">
          Initial sends and replies over the last {report.rangeDays} days. Replies use their own
          scale so a strong day still stands out against send volume.
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
            Darker cells mean more replies in America/New_York.
          </p>
          <ReplyHeatmap grid={report.heatmap} />
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Best send hours</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            Reply rate by the local hour the initial email was sent.
          </p>
          <BestSendTimes rows={report.bestHours} />
        </section>

        <TimeToReplyPanel ttr={report.ttr} />
      </div>

      <div className="mt-6">
        <InboxBreakdownPanel inboxes={report.inboxes} />
        <TrackedEngagementPanel
          trackedCampaignCount={report.trackedCampaignCount}
          tracking={report.tracking}
        />
      </div>
    </div>
  );
}

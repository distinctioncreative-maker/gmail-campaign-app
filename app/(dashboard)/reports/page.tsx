import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, listRecipients, ownerFromCtx, getDailyCount } from "@/lib/repositories/campaigns";
import { currentDayKey } from "@/lib/scheduling/window";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { ReplyHeatmap, TrendChart, BestSendTimes } from "@/components/analytics/Charts";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";
import {
  totals,
  timeToReply,
  replyHeatmap,
  bestSendTimes,
  dailyTrend,
  formatDuration,
  type RecipientPoint,
} from "@/lib/analytics/metrics";

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// Cap how many campaigns we scan at recipient level so the page stays fast.
const MAX_CAMPAIGNS_SCANNED = 40;

export default async function ReportsPage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const tz = ctx.user.timezone;

  const campaigns = await listCampaigns(owner, 200);
  const sentToday = await getDailyCount(owner, currentDayKey(tz));

  // Recipient-level points from the most recent campaigns that actually sent.
  const scanned = campaigns
    .filter((c) => c.sentCount > 0 || c.status === "ACTIVE")
    .slice(0, MAX_CAMPAIGNS_SCANNED);
  const recipientLists = await Promise.all(scanned.map((c) => listRecipients(owner, c.campaignId)));
  const points: RecipientPoint[] = recipientLists.flat().map((r) => ({
    initialSentAt: r.initialSentAt,
    repliedAt: r.repliedAt,
    bouncedAt: r.bouncedAt,
    unsubscribedAt: r.unsubscribedAt,
  }));

  const t = totals(points);
  const ttr = timeToReply(points);
  const heat = replyHeatmap(points, tz);
  const best = bestSendTimes(points, tz).filter((r) => r.sent >= 2);
  const trend = dailyTrend(points, tz);

  const activeCount = campaigns.filter((c) => c.status === "ACTIVE").length;
  const leaderboard = [...campaigns]
    .filter((c) => c.sentCount > 0)
    .map((c) => ({
      campaign: c,
      rate: c.sentCount > 0 ? (c.replyCount / c.sentCount) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  const bestCampaign = leaderboard[0];

  const kpis = [
    { label: "Emails sent", value: String(t.sent), tone: "text-slate-900" },
    { label: "Reply rate", value: t.sent ? pct(t.replyRate) : "—", tone: "text-green-600" },
    { label: "Median time to reply", value: formatDuration(ttr.medianMs), tone: "text-indigo-600" },
    { label: "Active campaigns", value: String(activeCount), tone: "text-slate-900" },
    { label: "Sent today", value: String(sentToday), tone: "text-slate-900" },
    { label: "Bounce rate", value: t.sent ? pct(t.bounceRate) : "—", tone: t.bounceRate > 3 ? "text-red-600" : "text-slate-500" },
  ];

  const csvRows = leaderboard.map((l) => [
    l.campaign.name,
    CAMPAIGN_STATUS_LABELS[l.campaign.status]?.label ?? l.campaign.status,
    l.campaign.sentCount + l.campaign.followupSentCount,
    l.campaign.replyCount,
    `${l.rate.toFixed(1)}%`,
    l.campaign.bounceCount,
    l.campaign.unsubscribeCount,
  ]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Reply performance across your campaigns — reply rates, when people reply, and what's working. No open tracking (it's unreliable and hurts deliverability)."
        actions={
          leaderboard.length > 0 ? (
            <ExportCsvButton
              filename="massleader-campaigns.csv"
              headers={["Campaign", "Status", "Sent", "Replies", "Reply rate", "Bounces", "Unsub"]}
              rows={csvRows}
            />
          ) : null
        }
      />

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="card card-hover p-5">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {bestCampaign && (
        <p className="mt-4 rounded-xl bg-primary-soft p-3 text-sm text-primary">
          🏆 Top campaign: <strong>{bestCampaign.campaign.name}</strong> at {pct(bestCampaign.rate)} reply rate.
        </p>
      )}

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-medium">Sent vs replies (30 days)</h2>
          <p className="mb-3 text-xs text-slate-500">Green = share that replied.</p>
          <TrendChart rows={trend} />
        </div>
        <div className="card p-5">
          <h2 className="font-medium">When people reply</h2>
          <p className="mb-3 text-xs text-slate-500">Darker = more replies at that day &amp; hour ({tz}).</p>
          <ReplyHeatmap grid={heat} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-medium">Best send times</h2>
          <p className="mb-3 text-xs text-slate-500">Reply rate by the hour an email went out.</p>
          <BestSendTimes rows={best} />
        </div>
        <div className="card p-5">
          <h2 className="font-medium">Time to reply</h2>
          <p className="mb-3 text-xs text-slate-500">
            {ttr.count > 0 ? `Based on ${ttr.count} repl${ttr.count === 1 ? "y" : "ies"}.` : "No replies yet."}
          </p>
          {ttr.count > 0 && (
            <div className="space-y-2">
              {[
                ["Within 1 hour", ttr.buckets.under1h],
                ["Within 1 day", ttr.buckets.under1d],
                ["Within 3 days", ttr.buckets.under3d],
                ["Later", ttr.buckets.later],
              ].map(([label, n]) => (
                <div key={label as string} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 text-slate-500">{label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(Number(n) / ttr.count) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 tabular-nums text-slate-500">{n}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-400">Average: {formatDuration(ttr.averageMs)}.</p>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <h2 className="mt-10 mb-3 font-medium">Campaign leaderboard</h2>
      {leaderboard.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No sends yet.</div>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Replies</th>
                <th className="px-4 py-3 min-w-40">Reply rate</th>
                <th className="px-4 py-3">Bounces</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(({ campaign: c, rate }) => {
                const badge = CAMPAIGN_STATUS_LABELS[c.status];
                return (
                  <tr key={c.campaignId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.sentCount + c.followupSentCount}</td>
                    <td className="px-4 py-3 tabular-nums">{c.replyCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, rate)}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-slate-500">{pct(rate)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.bounceCount}</td>
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

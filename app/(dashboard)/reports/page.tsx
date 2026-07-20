import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx, getDailyCount } from "@/lib/repositories/campaigns";
import { currentDayKey } from "@/lib/scheduling/window";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

export default async function ReportsPage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const campaigns = await listCampaigns(owner, 200);
  const sentToday = await getDailyCount(owner, currentDayKey(ctx.user.timezone));

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.sent += c.sentCount;
      acc.followups += c.followupSentCount;
      acc.replies += c.replyCount;
      acc.bounces += c.bounceCount;
      acc.unsubscribes += c.unsubscribeCount;
      acc.excluded += c.excludedRecipients;
      acc.errors += c.errorCount;
      return acc;
    },
    { sent: 0, followups: 0, replies: 0, bounces: 0, unsubscribes: 0, excluded: 0, errors: 0 }
  );

  const cards: Array<{ label: string; value: string; sub?: string; tone: string }> = [
    { label: "Sent today", value: String(sentToday), tone: "text-slate-900" },
    { label: "Emails sent (all time)", value: String(totals.sent + totals.followups), tone: "text-slate-900" },
    { label: "Replies", value: String(totals.replies), sub: pct(rate(totals.replies, totals.sent)), tone: "text-green-600" },
    { label: "Bounces", value: String(totals.bounces), sub: pct(rate(totals.bounces, totals.sent)), tone: "text-amber-600" },
    { label: "Unsubscribes", value: String(totals.unsubscribes), sub: pct(rate(totals.unsubscribes, totals.sent)), tone: "text-amber-600" },
    { label: "Follow-ups sent", value: String(totals.followups), tone: "text-slate-900" },
    { label: "Excluded for safety", value: String(totals.excluded), tone: "text-slate-500" },
    { label: "Problems", value: String(totals.errors), tone: totals.errors > 0 ? "text-red-600" : "text-slate-400" },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Your sending activity across every campaign. Reply and bounce rates are based on emails sent — we don't show unreliable “delivered” or open numbers."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card card-hover p-5">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>
              {c.value}
              {c.sub && <span className="ml-1.5 text-sm font-medium text-slate-400">{c.sub}</span>}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 font-medium">By campaign</h2>
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
                <th className="px-4 py-3 min-w-40">Reply rate</th>
                <th className="px-4 py-3">Bounces</th>
                <th className="px-4 py-3">Unsub</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const badge = CAMPAIGN_STATUS_LABELS[c.status];
                const r = rate(c.replyCount, c.sentCount);
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
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${Math.min(100, r ?? 0)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-slate-500">{pct(r)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.bounceCount}</td>
                    <td className="px-4 py-3 tabular-nums">{c.unsubscribeCount}</td>
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

import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx, getDailyCount } from "@/lib/repositories/campaigns";
import { currentDayKey } from "@/lib/scheduling/window";

function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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

  const cards = [
    ["Sent today", String(sentToday)],
    ["Emails sent (all time)", String(totals.sent + totals.followups)],
    ["Replies", `${totals.replies} (${rate(totals.replies, totals.sent)})`],
    ["Bounces", `${totals.bounces} (${rate(totals.bounces, totals.sent)})`],
    ["Unsubscribes", `${totals.unsubscribes} (${rate(totals.unsubscribes, totals.sent)})`],
    ["Follow-ups sent", String(totals.followups)],
    ["Excluded for safety", String(totals.excluded)],
    ["Problems", String(totals.errors)],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your sending activity across every campaign. Reply and bounce rates are based on
        emails sent — we don&apos;t show unreliable &ldquo;delivered&rdquo; or open numbers.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 font-medium">By campaign</h2>
      {campaigns.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          No campaigns yet.
        </p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Replies</th>
                <th className="px-4 py-3">Reply rate</th>
                <th className="px-4 py-3">Bounces</th>
                <th className="px-4 py-3">Unsub</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaignId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.sentCount + c.followupSentCount}</td>
                  <td className="px-4 py-3">{c.replyCount}</td>
                  <td className="px-4 py-3">{rate(c.replyCount, c.sentCount)}</td>
                  <td className="px-4 py-3">{c.bounceCount}</td>
                  <td className="px-4 py-3">{c.unsubscribeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

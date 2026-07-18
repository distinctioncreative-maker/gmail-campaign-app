import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listCampaigns } from "@/lib/repositories/campaigns";

/**
 * Manager aggregate view (spec §21). Shows team-wide totals and campaign
 * names/counts/statuses only — never recipient identities or message
 * bodies (those stay private to each rep unless org policy says otherwise).
 */
export default async function TeamPage() {
  const ctx = await requireUser();
  if (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") redirect("/home");

  const members = await listMembers(ctx.organizationId);

  let totalSent = 0;
  let totalReplies = 0;
  let totalBounces = 0;
  let totalUnsub = 0;
  let activeReps = 0;
  const campaignRows: Array<{ rep: string; name: string; status: string; sent: number; replies: number }> = [];

  for (const m of members) {
    const owner = { userId: m.userId, organizationId: ctx.organizationId };
    const campaigns = await listCampaigns(owner, 200);
    if (campaigns.some((c) => c.status === "ACTIVE")) activeReps++;
    for (const c of campaigns) {
      totalSent += c.sentCount + c.followupSentCount;
      totalReplies += c.replyCount;
      totalBounces += c.bounceCount;
      totalUnsub += c.unsubscribeCount;
      campaignRows.push({
        rep: m.email,
        name: c.name,
        status: c.status,
        sent: c.sentCount + c.followupSentCount,
        replies: c.replyCount,
      });
    }
  }

  const cards = [
    ["Emails sent", String(totalSent)],
    ["Active reps", String(activeReps)],
    ["Replies", String(totalReplies)],
    ["Bounces", String(totalBounces)],
    ["Unsubscribes", String(totalUnsub)],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mt-1 text-sm text-slate-600">
        Aggregate activity across your team. Individual recipient details stay private to each rep.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 font-medium">Campaigns</h2>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Replies</th>
            </tr>
          </thead>
          <tbody>
            {campaignRows.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-sm text-slate-500" colSpan={5}>
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              campaignRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-600">{r.rep}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.status.toLowerCase()}</td>
                  <td className="px-4 py-3">{r.sent}</td>
                  <td className="px-4 py-3">{r.replies}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listTeams } from "@/lib/repositories/teams";
import { getCampaign, listRecipients } from "@/lib/repositories/campaigns";
import { canViewRep } from "@/lib/teams/access";
import { CAMPAIGN_STATUS_LABELS, recipientStatusBadge } from "@/lib/campaigns/statusLabels";
import { LocalTime } from "@/components/LocalTime";

/**
 * Read-only view of one rep's campaign for their Team Lead / an Admin.
 * No controls here on purpose — leads coach; only the rep (or an admin in
 * the rep's own UI) operates the campaign.
 */
export default async function RepCampaignPage({
  params,
}: {
  params: Promise<{ userId: string; campaignId: string }>;
}) {
  const ctx = await requireUser();
  if (ctx.role !== "MANAGER" && ctx.role !== "ADMIN") redirect("/home");
  const { userId, campaignId } = await params;

  const [teams, members] = await Promise.all([
    listTeams(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);
  const memberLites = members.map((m) => ({ userId: m.userId, teamId: m.teamId }));
  if (!canViewRep({ userId: ctx.userId, role: ctx.role }, userId, teams, memberLites)) {
    redirect("/team");
  }

  const owner = { userId, organizationId: ctx.organizationId };
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) notFound();
  const recipients = await listRecipients(owner, campaignId);

  const badge = CAMPAIGN_STATUS_LABELS[campaign.status] ?? {
    label: campaign.status,
    className: "bg-slate-100 text-slate-600",
  };
  const sent = campaign.sentCount + campaign.followupSentCount;
  const rep = members.find((m) => m.userId === userId);

  return (
    <div>
      <Link href={`/team/${userId}`} className="text-sm text-slate-500 hover:underline">
        ← {rep?.email ?? "Rep"}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
        <span className="badge bg-slate-100 text-slate-600">Read-only</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {sent} sent · {campaign.replyCount} repl{campaign.replyCount === 1 ? "y" : "ies"} ·{" "}
        {campaign.bounceCount} bounce{campaign.bounceCount === 1 ? "" : "s"}
      </p>

      <div className="mt-6 overflow-x-auto card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sent</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-sm text-slate-500">
                  No recipients.
                </td>
              </tr>
            ) : (
              recipients.map((r) => {
                const rb = recipientStatusBadge(r.status);
                return (
                  <tr key={r.recipientId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{r.fullNameSnapshot || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.emailSnapshot}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${rb.className}`}>{rb.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.initialSentAt ? <LocalTime value={r.initialSentAt} /> : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

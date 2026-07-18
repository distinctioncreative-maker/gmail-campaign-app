import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";

export default async function CampaignsPage() {
  const ctx = await requireUser();
  const campaigns = await listCampaigns(ownerFromCtx(ctx));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Each campaign sends a personalized email to a list of your leads.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
        >
          Create campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-slate-600">No campaigns yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            A guided wizard walks you through leads, email, schedule, and a safety review.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          >
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Replies</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const badge = CAMPAIGN_STATUS_LABELS[c.status];
                return (
                  <tr key={c.campaignId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/campaigns/${c.campaignId}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">{c.eligibleRecipients}</td>
                    <td className="px-4 py-3">{c.sentCount + c.followupSentCount}</td>
                    <td className="px-4 py-3">{c.replyCount}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </td>
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

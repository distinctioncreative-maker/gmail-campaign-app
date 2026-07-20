import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { CampaignsTable } from "@/components/campaign/CampaignsTable";

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
        <CampaignsTable
          campaigns={campaigns.map((c) => {
            const badge = CAMPAIGN_STATUS_LABELS[c.status];
            return {
              campaignId: c.campaignId,
              name: c.name,
              status: c.status,
              statusLabel: badge.label,
              statusClass: badge.className,
              recipients: c.eligibleRecipients,
              sent: c.sentCount + c.followupSentCount,
              replies: c.replyCount,
              updatedAt: c.updatedAt,
            };
          })}
        />
      )}
    </div>
  );
}

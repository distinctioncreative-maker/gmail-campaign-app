import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import {
  getCampaign,
  listEvents,
  listRecipients,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { CampaignControls } from "@/components/campaign/CampaignControls";
import { RecipientTable } from "@/components/campaign/RecipientTable";
import { LocalTime } from "@/components/LocalTime";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) notFound();

  const [recipients, events] = await Promise.all([
    listRecipients(owner, campaignId),
    listEvents(owner, campaignId, 50),
  ]);
  const badge = CAMPAIGN_STATUS_LABELS[campaign.status];

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-slate-500 hover:underline">
        ← All campaigns
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          {campaign.description && <p className="text-sm text-slate-500">{campaign.description}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${badge.className}`}>{badge.label}</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Recipients", campaign.eligibleRecipients],
          ["Sent", campaign.sentCount],
          ["Follow-ups", campaign.followupSentCount],
          ["Replies", campaign.replyCount],
          ["Excluded", campaign.excludedRecipients],
          ["Problems", campaign.errorCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <CampaignControls
          campaignId={campaign.campaignId}
          status={campaign.status}
          followupsPaused={campaign.followupsPaused}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="mb-3 font-medium">Recipients</h2>
          <RecipientTable
            campaignId={campaign.campaignId}
            campaignStatus={campaign.status}
            recipients={recipients.map((r) => ({
              recipientId: r.recipientId,
              fullName: r.fullNameSnapshot,
              email: r.emailSnapshot,
              status: r.status,
              included: r.included,
              exclusionReason: r.exclusionReason,
              scheduledAt: r.initialScheduledAt,
              sentAt: r.initialSentAt,
              gmailThreadId: r.gmailThreadId,
            }))}
          />
        </div>
        <div>
          <h2 className="mb-3 font-medium">Activity</h2>
          <div className="card p-4">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.eventId} className="text-sm">
                    <p
                      className={
                        e.severity === "ERROR"
                          ? "text-red-700"
                          : e.severity === "WARNING"
                            ? "text-amber-700"
                            : "text-slate-700"
                      }
                    >
                      {e.message}
                    </p>
                    <LocalTime value={e.createdAt} className="text-xs text-slate-400" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

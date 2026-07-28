import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { CampaignsTable } from "@/components/campaign/CampaignsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const ctx = await requireUser();
  const { archived: showArchivedParam } = await searchParams;
  const showArchived = showArchivedParam === "1";

  const all = await listCampaigns(ownerFromCtx(ctx));
  const archivedCount = all.filter((c) => c.archived).length;
  const campaigns = all.filter((c) => (showArchived ? c.archived : !c.archived));

  return (
    <div>
      <PageHeader
        title={showArchived ? "Archived campaigns" : "Campaigns"}
        description="Each campaign sends a personalized email to a list of your leads."
        actions={
          <Link href="/campaigns/new" className="btn-primary px-5 py-2.5 text-sm">
            Create campaign
          </Link>
        }
      />

      {(archivedCount > 0 || showArchived) && (
        <div className="mb-4">
          {showArchived ? (
            <Link href="/campaigns" className="text-sm font-medium text-primary hover:underline">
              ← Back to active campaigns
            </Link>
          ) : (
            <Link href="/campaigns?archived=1" className="text-sm text-muted hover:underline">
              View archived ({archivedCount}) →
            </Link>
          )}
        </div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          icon="rocket"
          title="No campaigns yet."
          description="A guided wizard walks you through leads, email, schedule, and a safety review."
          action={{ href: "/campaigns/new", label: "Create your first campaign" }}
        />
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
              archived: c.archived,
            };
          })}
        />
      )}
    </div>
  );
}

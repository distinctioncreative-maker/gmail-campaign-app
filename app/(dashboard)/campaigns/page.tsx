import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { CampaignsTable } from "@/components/campaign/CampaignsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CountUp } from "@/components/ui/CountUp";
import { campaignPerformance } from "@/lib/analytics/metrics";

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
  const activeCount = campaigns.filter((campaign) =>
    ["READY", "PREPARING", "ACTIVE", "PAUSED"].includes(campaign.status)
  ).length;
  const draftCount = campaigns.filter((campaign) => campaign.status === "DRAFT").length;
  const attentionCount = campaigns.filter(
    (campaign) => campaign.status === "ERROR" || campaign.errorCount > 0
  ).length;
  const totalReplies = campaigns.reduce(
    (sum, campaign) => sum + campaign.replyCount,
    0
  );

  return (
    <div>
      <PageHeader
        title={showArchived ? "Archived campaigns" : "Campaigns"}
        description="Plan, monitor, and compare every outreach motion from one workspace."
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

      {campaigns.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: showArchived ? "Archived" : "In progress",
              value: showArchived ? campaigns.length : activeCount,
              detail: showArchived ? "Kept for reporting" : "Ready, sending, or paused",
              tone: "text-primary",
            },
            {
              label: "Drafts",
              value: draftCount,
              detail: "Not launched",
              tone: "text-foreground",
            },
            {
              label: "Replies",
              value: totalReplies,
              detail: "Across this campaign view",
              tone: "text-green-600",
            },
            {
              label: "Needs attention",
              value: attentionCount,
              detail: attentionCount > 0 ? "Review errors or blocked sends" : "No active issues",
              tone: attentionCount > 0 ? "text-red-600" : "text-muted",
            },
          ].map((item) => (
            <div key={item.label} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {item.label}
              </p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>
                <CountUp value={item.value} />
              </p>
              <p className="mt-1 text-xs text-muted/70">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

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
            const performance = campaignPerformance(c);
            return {
              campaignId: c.campaignId,
              name: c.name,
              status: c.status,
              statusLabel: badge.label,
              statusClass: badge.className,
              recipients: c.eligibleRecipients,
              initialSent: c.sentCount,
              sent: c.sentCount + c.followupSentCount,
              replies: c.replyCount,
              bounces: c.bounceCount,
              errors: c.errorCount,
              progressRate: performance.progressRate,
              replyRate: performance.replyRate,
              updatedAt: c.updatedAt,
              archived: c.archived,
            };
          })}
        />
      )}
    </div>
  );
}

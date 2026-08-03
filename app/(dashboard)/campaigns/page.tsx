import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { CampaignsTable } from "@/components/campaign/CampaignsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { campaignPerformance } from "@/lib/analytics/metrics";
import {
  campaignsForCollectionView,
  type CampaignCollectionView,
} from "@/lib/campaigns/lifecycle";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;
  const view: CampaignCollectionView =
    params.view === "deleted"
      ? "deleted"
      : params.view === "archived" || params.archived === "1"
        ? "archived"
        : "active";

  const all = await listCampaigns(ownerFromCtx(ctx));
  const activeCountAll = campaignsForCollectionView(all, "active").length;
  const archivedCount = campaignsForCollectionView(all, "archived").length;
  const deletedCount = campaignsForCollectionView(all, "deleted").length;
  const campaigns = campaignsForCollectionView(all, view);
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
        title={
          view === "deleted"
            ? "Recently deleted"
            : view === "archived"
              ? "Archived campaigns"
              : "Campaigns"
        }
        description={
          view === "deleted"
            ? "Restore campaigns or review retained metrics before deleting them forever."
            : "Plan, monitor, and compare every outreach motion from one workspace."
        }
        actions={
          <Link href="/campaigns/new" className="btn-primary px-5 py-2.5 text-sm">
            Create campaign
          </Link>
        }
      />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Campaign collections">
        {[
          { key: "active", href: "/campaigns", label: "Active", count: activeCountAll },
          { key: "archived", href: "/campaigns?view=archived", label: "Archived", count: archivedCount },
          { key: "deleted", href: "/campaigns?view=deleted", label: "Recently deleted", count: deletedCount },
        ].map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={view === item.key ? "page" : undefined}
            className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              view === item.key
                ? "border-primary bg-surface-2 text-foreground"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {item.label} <span className="ml-1 tabular-nums opacity-70">{item.count}</span>
          </Link>
        ))}
      </nav>

      {view === "deleted" && campaigns.length > 0 ? (
        <div className="alert-warning mb-5 rounded-xl border p-4 text-sm leading-relaxed">
          Deleted campaigns no longer contribute to workspace or report totals. Their recipient
          history and KPIs stay available here until you choose Delete forever.
        </div>
      ) : null}

      {campaigns.length > 0 ? (
        <StatGrid columns={4}>
          {(
            [
              {
                label: view === "deleted" ? "Deleted" : view === "archived" ? "Archived" : "In progress",
                value: view === "active" ? activeCount : campaigns.length,
                hint: view === "deleted" ? "Retained for recovery" : view === "archived" ? "Included in reporting" : "Ready, sending, or paused",
                icon: "rocket",
                tone: "primary",
              },
              {
                label: "Drafts",
                value: draftCount,
                hint: "Not launched",
                icon: "edit",
                tone: "default",
              },
              {
                label: "Replies",
                value: totalReplies,
                hint: "Across this campaign view",
                icon: "reply",
                tone: totalReplies > 0 ? "revenue" : "default",
              },
              {
                label: "Needs attention",
                value: attentionCount,
                hint: attentionCount > 0 ? "Review errors or blocked sends" : "No active issues",
                icon: "alert",
                tone: attentionCount > 0 ? "danger" : "default",
              },
            ] as const
          ).map((item) => (
            <StatTile
              key={item.label}
              label={item.label}
              icon={item.icon}
              tone={item.tone}
              size="sm"
              hint={item.hint}
              value={<CountUp value={item.value} />}
            />
          ))}
        </StatGrid>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={view === "active" ? "rocket" : "trash"}
          title={view === "deleted" ? "Recently deleted is empty" : view === "archived" ? "No archived campaigns" : "Your first campaign is four steps away"}
          description={view === "deleted" ? "Campaigns you delete will remain recoverable here." : view === "archived" ? "Archive finished campaigns to keep the active list focused without changing reports." : "Pick your leads, write one email, set the pace, and Cadence sends it from your own Gmail. A safety review runs before anything leaves your account."}
          action={view === "active" ? { href: "/campaigns/new", label: "Create your first campaign" } : { href: "/campaigns", label: "Back to campaigns" }}
          secondaryAction={view === "active" ? { href: "/help", label: "See how it works" } : undefined}
        />
      ) : (
        <CampaignsTable
          lifecycleView={view}
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
              unsubscribes: c.unsubscribeCount,
              errors: c.errorCount,
              progressRate: performance.progressRate,
              replyRate: performance.replyRate,
              updatedAt: c.updatedAt,
              archived: c.archived,
              archivedAt: c.archivedAt,
              deletedAt: c.deletedAt,
            };
          })}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { describeTracking, tracksAnything } from "@/lib/tracking/settings";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import {
  getCampaign,
  listEvents,
  listRecipients,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { listTemplates } from "@/lib/repositories/templates";
import { CampaignControls } from "@/components/campaign/CampaignControls";
import { Meter } from "@/components/ui/charts/Meter";
import { CampaignDiagnostics } from "@/components/campaign/CampaignDiagnostics";
import { RecipientTable } from "@/components/campaign/RecipientTable";
import { LocalTime } from "@/components/LocalTime";
import { LiveRefresh } from "@/components/LiveRefresh";
import {
  campaignPerformance,
  formatPercent,
} from "@/lib/analytics/metrics";
import { CountUp } from "@/components/ui/CountUp";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatTile, StatGrid, type StatTone } from "@/components/ui/StatTile";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PLANS } from "@/lib/billing/plans";
import { assessEngagement } from "@/lib/campaigns/engagementPace";
import { CampaignSectionNav } from "@/components/campaign/CampaignSectionNav";
import { LaunchCelebration } from "@/components/campaign/LaunchCelebration";
import { EntityHeader } from "@/components/ui/EntityHeader";
import { DataTable, TableRow } from "@/components/ui/DataTable";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ launched?: string }>;
}) {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const { launched } = await searchParams;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) notFound();

  const [recipients, events, settings] = await Promise.all([
    listRecipients(owner, campaignId),
    listEvents(owner, campaignId, 50),
    getOrgSettings(ctx.organizationId),
  ]);
  const badge = CAMPAIGN_STATUS_LABELS[campaign.status];

  // A/B rotation performance: group recipients by assigned template.
  const abRows: Array<{ name: string; sent: number; replied: number }> = [];
  if (campaign.templateRotation.length > 1) {
    const templates = await listTemplates(ctx, { includeArchived: true });
    const nameById = new Map(templates.map((t) => [t.templateId, t.name]));
    for (const tid of campaign.templateRotation) {
      const group = recipients.filter((r) => r.templateIdSnapshot === tid);
      abRows.push({
        name: nameById.get(tid) ?? "Template",
        sent: group.filter((r) => r.initialSentAt !== null).length,
        replied: group.filter((r) => r.repliedAt !== null).length,
      });
    }
  }

  const totalToSend = campaign.eligibleRecipients;
  const doneCount = campaign.sentCount;
  const pct = totalToSend > 0 ? Math.min(100, Math.round((doneCount / totalToSend) * 100)) : 0;
  const remaining = Math.max(0, totalToSend - doneCount);
  const performance = campaignPerformance(campaign);
  const engagement = assessEngagement({
    sentCount: campaign.sentCount,
    replyCount: campaign.replyCount,
    dailySendLimit: campaign.schedule.dailySendLimit,
  });
  const openedCount = recipients.filter((recipient) => recipient.openedAt !== null).length;
  const clickedCount = recipients.filter(
    (recipient) => recipient.firstClickedAt !== null
  ).length;
  const trackedSentCount = recipients.filter(
    (recipient) => recipient.initialSentAt !== null
  ).length;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sendingDays = campaign.schedule.allowedWeekdays
    .map((day) => dayNames[day])
    .join(", ");

  const stats: Array<{
    label: string;
    value: number;
    detail: string;
    icon: IconName;
    tone: StatTone;
  }> = [
    {
      label: "Eligible leads",
      value: campaign.eligibleRecipients,
      detail: `${campaign.excludedRecipients} excluded`,
      icon: "users",
      tone: "default",
    },
    {
      label: "Total sends",
      value: performance.sent,
      detail: `${campaign.sentCount} initial, ${campaign.followupSentCount} follow-ups`,
      icon: "mail",
      tone: "primary",
    },
    {
      label: "Replies",
      value: campaign.replyCount,
      detail: `${formatPercent(performance.replyRate)} reply rate`,
      icon: "reply",
      tone: campaign.replyCount > 0 ? "revenue" : "default",
    },
    {
      label: "Bounces",
      value: campaign.bounceCount,
      detail: `${formatPercent(performance.bounceRate)} bounce rate`,
      icon: "alert",
      tone: campaign.bounceCount > 0 ? "warning" : "default",
    },
    {
      label: "Unsubscribes",
      value: campaign.unsubscribeCount,
      detail: `${formatPercent(performance.unsubscribeRate)} of sends`,
      icon: "ban",
      tone: campaign.unsubscribeCount > 0 ? "warning" : "default",
    },
    {
      label: "Problems",
      value: campaign.errorCount,
      detail: campaign.errorCount > 0 ? "Review diagnostics below" : "No active errors",
      icon: "shield",
      tone: campaign.errorCount > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="page-sections animate-rise">
      {launched === "1" && campaign.deletedAt === null && (
        <LaunchCelebration
          recipientCount={campaign.eligibleRecipients}
          startedNow={campaign.status !== "READY" && campaign.status !== "DRAFT"}
        />
      )}

      {/* EntityHeader rather than PageHeader: this screen is about one campaign,
          and it used to open identically to the list it was reached from. The
          status was previously the last item inside `actions`, which put the
          single most decision-relevant fact on the page in the position reserved
          for buttons. It is a badge beside the name now. */}
      <EntityHeader
        kicker="Campaign"
        title={campaign.name}
        status={{ label: badge.label, className: badge.className }}
        description={campaign.description || undefined}
        backHref={campaign.deletedAt !== null ? "/campaigns?view=deleted" : "/campaigns"}
        backLabel={campaign.deletedAt !== null ? "Recently deleted" : "All campaigns"}
        meta={[
          {
            label: "Recipients",
            value: (
              <span className="tabular-nums">
                {campaign.eligibleRecipients.toLocaleString()}
              </span>
            ),
          },
          {
            label: "Sent",
            value: (
              <span className="tabular-nums">{campaign.sentCount.toLocaleString()}</span>
            ),
          },
          {
            label: "Replies",
            value: (
              <span className="tabular-nums">{campaign.replyCount.toLocaleString()}</span>
            ),
          },
          {
            label: "Created",
            value: <LocalTime value={campaign.createdAt} options={{ dateStyle: "medium" }} />,
          },
        ]}
        actions={
          <>
            {campaign.status === "ACTIVE" && <LiveRefresh intervalMs={12000} />}
            {campaign.deletedAt === null ? (
              <Link
                href={`/reports?campaign=${campaign.campaignId}&range=30`}
                className="btn-ghost px-3 py-2 text-xs"
              >
                <Icon name="chart" size={15} />
                View report
              </Link>
            ) : null}
          </>
        }
      />

      {campaign.deletedAt !== null ? (
        <div className="alert-warning mt-5 rounded-lg border p-4 text-sm leading-relaxed">
          <p className="font-semibold">This campaign is in Recently Deleted.</p>
          <p className="mt-1">
            Deleted <LocalTime value={campaign.deletedAt} options={{ dateStyle: "long", timeStyle: "short" }} />.
            Its recipients, activity, and KPIs are retained, but it is excluded from workspace and report totals.
          </p>
        </div>
      ) : campaign.archivedAt !== null ? (
        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
          Archived <LocalTime value={campaign.archivedAt} options={{ dateStyle: "long" }} />.
          This campaign remains included in reporting.
        </div>
      ) : null}

      {/* Pacing is now partly decided by how the campaign is performing, so the
          reason has to be visible on the page rather than only in the diagnose
          panel: a throttled campaign otherwise reads as a stuck one. */}
      {engagement.message !== null ? (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm leading-relaxed ${
            engagement.verdict === "STRONG" ? "alert-success" : "alert-warning"
          }`}
        >
          <p className="font-semibold">
            {engagement.verdict === "STRONG"
              ? "People are replying to this one"
              : `Sending is at ${Math.round(engagement.factor * 100)}% of your daily limit`}
          </p>
          <p className="mt-1">{engagement.message}</p>
        </div>
      ) : null}

      <CampaignSectionNav showControls={campaign.deletedAt === null} />

      <div id="overview" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="card p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Initial-send progress
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {doneCount.toLocaleString()} of {totalToSend.toLocaleString()} leads contacted
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-foreground">{pct}%</p>
              <p className="text-sm text-muted">{remaining.toLocaleString()} remaining</p>
            </div>
          </div>
          <Meter value={pct} tone="good" height={12} className="mt-4 w-full" />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Follow-up sends are reported separately and do not inflate campaign completion.
          </p>
        </section>

        <section className="card p-6 sm:p-7">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Campaign setup
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Sending days</dt>
              <dd className="mt-0.5 font-medium">{sendingDays}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Local window</dt>
              <dd className="mt-0.5 font-medium">
                {campaign.schedule.sendWindowStart} to {campaign.schedule.sendWindowEnd}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Timezone</dt>
              <dd className="mt-0.5 truncate font-medium" title={campaign.schedule.timezone}>
                {campaign.schedule.timezone}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Daily limit</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {campaign.schedule.dailySendLimit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Delivery mode</dt>
              <dd className="mt-0.5 font-medium">
                {campaign.draftStrategy === "DRAFT_ONLY" ? "Gmail drafts" : "Send"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Open and click tracking</dt>
              <dd className="mt-0.5 font-medium">
                {describeTracking(campaign)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div>
        <StatGrid columns={6}>
          {stats.map((s) => (
            <StatTile
              key={s.label}
              label={s.label}
              icon={s.icon}
              tone={s.tone}
              size="sm"
              hint={s.detail}
              value={<CountUp value={s.value} />}
            />
          ))}
        </StatGrid>
      </div>

      {tracksAnything(campaign) ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p>
              <span className="font-semibold text-info">{openedCount}</span>{" "}
              open detection{openedCount === 1 ? "" : "s"}
              {trackedSentCount > 0
                ? ` (${((openedCount / trackedSentCount) * 100).toFixed(1)}%)`
                : ""}
            </p>
            <p>
              <span className="font-semibold text-info">{clickedCount}</span>{" "}
              unique clicker{clickedCount === 1 ? "" : "s"}
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Open detections can include privacy preloading by email clients. Use replies and clicks
            as stronger intent signals.
          </p>
        </div>
      ) : null}

      {campaign.deletedAt === null ? (
        <>
          <div id="controls" className="scroll-mt-24">
            <CampaignControls
              campaignId={campaign.campaignId}
              status={campaign.status}
              followupsPaused={campaign.followupsPaused}
              maxDailySends={PLANS[settings.billing.plan].maxDailySends}
              pace={{
                dailySendLimit: campaign.schedule.dailySendLimit,
                emailsPerBatch: campaign.schedule.emailsPerBatch,
                minDelaySeconds: campaign.schedule.minDelaySeconds,
                maxDelaySeconds: campaign.schedule.maxDelaySeconds,
                interBatchDelayMinutes: campaign.schedule.interBatchDelayMinutes,
                sendWindowStart: campaign.schedule.sendWindowStart,
                sendWindowEnd: campaign.schedule.sendWindowEnd,
                pacingMode: campaign.schedule.pacingMode,
              }}
            />
          </div>

          <div>
            <CampaignDiagnostics campaignId={campaign.campaignId} />
          </div>
        </>
      ) : null}

      {abRows.length > 0 && (
        <div className="card p-6 sm:p-7">
          <h2>Template performance (A/B)</h2>
          <DataTable
            className="mt-3"
            head={
              <>
                <th className="py-2 pr-4">Template</th>
                <th className="py-2 pr-4">Sent</th>
                <th className="py-2 pr-4">Replies</th>
                <th className="py-2">Reply rate</th>
              </>
            }
          >
                {abRows.map((r, i) => {
                  const rate = r.sent > 0 ? (r.replied / r.sent) * 100 : 0;
                  const best = Math.max(...abRows.map((x) => (x.sent > 0 ? x.replied / x.sent : 0)));
                  const isBest = r.sent > 0 && r.replied / r.sent === best && best > 0;
                  return (
                    <TableRow key={i} interactive={false}>
                      <td className="py-2 pr-4 font-medium">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-3xs font-bold text-foreground">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {r.name}
                        {isBest && <span className="ml-2 text-xs font-semibold text-success">Leading variant</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{r.sent}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.replied}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Meter value={rate} className="w-24" />
                          <span className="tabular-nums text-xs text-muted">
                            {r.sent > 0 ? `${rate.toFixed(1)}%` : "Not available"}
                          </span>
                        </div>
                      </td>
                    </TableRow>
                  );
                })}
          </DataTable>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div id="recipients" className="scroll-mt-24">
          <h2 className="mb-3">Recipients</h2>
          <RecipientTable
            campaignId={campaign.campaignId}
            campaignStatus={campaign.status}
            emailsPerBatch={campaign.schedule.emailsPerBatch}
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
        <div id="activity" className="scroll-mt-24">
          <h2 className="mb-3">Activity</h2>
          <div className="card p-5 sm:p-6">
            {events.length === 0 ? (
              <p className="text-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.eventId} className="text-sm">
                    <p
                      className={
                        e.severity === "ERROR"
                          ? "text-danger"
                          : e.severity === "WARNING"
                            ? "text-warning"
                            : "text-foreground"
                      }
                    >
                      {e.message}
                    </p>
                    <LocalTime value={e.createdAt} className="text-xs text-muted" />
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

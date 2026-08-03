import "server-only";

import { listCampaigns, listRecipients, type OwnerRef } from "@/lib/repositories/campaigns";
import {
  timeToReply,
  replyHeatmap,
  bestSendTimes,
  dailyTrend,
  totalSent,
  campaignPerformance,
  openClickRates,
  recipientsSentSince,
  reportWindow,
  type RecipientPoint,
  type CampaignPerformance,
  type TimeToReply,
  type OpenClickRates,
} from "@/lib/analytics/metrics";
import type { Campaign } from "@/schemas/campaign";
import { campaignsIncludedInWorkspaceStats } from "@/lib/campaigns/lifecycle";

/**
 * Everything the Reports page renders, assembled in one place.
 *
 * The page had grown to roughly 250 lines of loading and aggregation sitting
 * directly above 400 lines of JSX, which made both halves hard to follow and
 * the arithmetic impossible to test. The pure helpers below are exported so
 * the totals, funnel, and ranking can be asserted without a Firestore stub.
 */

/** Recipient-level analysis is capped to keep the report responsive. Cached
 * campaign counters stay exact across every campaign in the selected scope. */
export const MAX_CAMPAIGNS_SCANNED = 40;

export const RANGE_OPTIONS = [30, 90, 365] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

/** Query params arrive as string | string[] | undefined. Take the first. */
export function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Anything not on the offered list falls back to 30 days. */
export function resolveRangeDays(raw: string | string[] | undefined): RangeDays {
  const n = Number(stringParam(raw));
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

export interface ReportTotals {
  sent: number;
  initialSent: number;
  followups: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
  eligible: number;
  excluded: number;
}

/** All-time counters summed across the campaigns in scope. */
export function sumTotals(campaigns: Campaign[]): ReportTotals {
  const add = (pick: (c: Campaign) => number) => campaigns.reduce((sum, c) => sum + pick(c), 0);
  return {
    sent: add(totalSent),
    initialSent: add((c) => c.sentCount),
    followups: add((c) => c.followupSentCount),
    replies: add((c) => c.replyCount),
    bounces: add((c) => c.bounceCount),
    unsubscribes: add((c) => c.unsubscribeCount),
    eligible: add((c) => c.eligibleRecipients),
    excluded: add((c) => c.excludedRecipients),
  };
}

export interface FunnelStep {
  label: string;
  value: number;
  detail: string;
}

/** Eligible leads, to emails sent, to replies: the three numbers that matter. */
export function buildFunnel(t: ReportTotals): FunnelStep[] {
  return [
    {
      label: "Eligible leads",
      value: t.eligible,
      detail: `${t.excluded.toLocaleString()} excluded by campaign rules`,
    },
    {
      label: "Initial emails sent",
      value: t.initialSent,
      detail:
        t.eligible > 0
          ? `${Math.min(100, (t.initialSent / t.eligible) * 100).toFixed(1)}% of eligible leads`
          : "No eligible leads yet",
    },
    {
      label: "Replies",
      value: t.replies,
      detail:
        t.initialSent > 0
          ? `${((t.replies / t.initialSent) * 100).toFixed(1)}% of contacted leads`
          : "No initial sends yet",
    },
  ];
}

export interface LeaderboardRow {
  campaign: Campaign;
  performance: CampaignPerformance;
}

/** Campaigns with at least one send, best reply rate first. */
export function buildLeaderboard(campaigns: Campaign[]): LeaderboardRow[] {
  return campaigns
    .filter((c) => totalSent(c) > 0)
    .map((campaign) => ({ campaign, performance: campaignPerformance(campaign) }))
    .sort(
      (a, b) =>
        b.performance.replyRate - a.performance.replyRate ||
        b.performance.sent - a.performance.sent
    );
}

export interface ReportData {
  /** Every campaign the user owns, for the filter dropdown. */
  allCampaigns: Campaign[];
  /** The campaign the report is scoped to, or null for "all campaigns". */
  selectedCampaign: Campaign | null;
  /** Campaigns actually being reported on. */
  scopeCampaigns: Campaign[];
  rangeDays: RangeDays;
  activeCount: number;
  /** True when more campaigns qualified for timing analysis than we scanned. */
  scanIsCapped: boolean;
  totals: ReportTotals;
  funnel: FunnelStep[];
  leaderboard: LeaderboardRow[];
  best: LeaderboardRow | null;
  ttr: TimeToReply;
  heatmap: number[][];
  bestHours: ReturnType<typeof bestSendTimes>;
  trend: ReturnType<typeof dailyTrend>;
  trackedCampaignCount: number;
  tracking: OpenClickRates;
}

/**
 * Load and aggregate one report. Recipient-level work (timing, tracking) is
 * capped at MAX_CAMPAIGNS_SCANNED; campaign counters are not, so headline
 * totals stay exact even on accounts with hundreds of campaigns.
 */
export async function loadReport(
  owner: OwnerRef,
  timezone: string,
  opts: { campaignId: string; rangeDays: RangeDays }
): Promise<ReportData> {
  const allCampaigns = campaignsIncludedInWorkspaceStats(
    await listCampaigns(owner, 200)
  );
  const selectedCampaign = allCampaigns.find((c) => c.campaignId === opts.campaignId) ?? null;
  const scopeCampaigns = selectedCampaign ? [selectedCampaign] : allCampaigns;

  const eligibleForScan = scopeCampaigns.filter(
    (c) => c.sentCount > 0 || c.status === "ACTIVE"
  );
  const scanned = eligibleForScan.slice(0, MAX_CAMPAIGNS_SCANNED);
  const recipientLists = await Promise.all(
    scanned.map((c) => listRecipients(owner, c.campaignId))
  );

  const window = reportWindow(opts.rangeDays);
  const points: RecipientPoint[] = recipientLists.flat().map((r) => ({
    initialSentAt: r.initialSentAt,
    repliedAt: r.repliedAt,
    bouncedAt: r.bouncedAt,
    unsubscribedAt: r.unsubscribedAt,
  }));
  const periodPoints = recipientsSentSince(points, window.since);

  // Open and click rates only mean anything for campaigns that opted into
  // tracking, so those recipients are gathered separately.
  const trackedPoints = recipientsSentSince(
    scanned.flatMap((c, i) =>
      c.trackingEnabled
        ? recipientLists[i].map((r) => ({
            initialSentAt: r.initialSentAt,
            repliedAt: r.repliedAt,
            bouncedAt: r.bouncedAt,
            unsubscribedAt: r.unsubscribedAt,
            openedAt: r.openedAt,
            firstClickedAt: r.firstClickedAt,
          }))
        : []
    ),
    window.since
  );

  const totals = sumTotals(scopeCampaigns);
  const leaderboard = buildLeaderboard(scopeCampaigns);

  return {
    allCampaigns,
    selectedCampaign,
    scopeCampaigns,
    rangeDays: opts.rangeDays,
    activeCount: scopeCampaigns.filter((c) => c.status === "ACTIVE").length,
    scanIsCapped: eligibleForScan.length > scanned.length,
    totals,
    funnel: buildFunnel(totals),
    leaderboard,
    best: leaderboard[0] ?? null,
    ttr: timeToReply(periodPoints),
    heatmap: replyHeatmap(periodPoints, timezone),
    bestHours: bestSendTimes(periodPoints, timezone).filter((row) => row.sent >= 2),
    trend: dailyTrend(periodPoints, timezone, opts.rangeDays, window.now),
    trackedCampaignCount: scanned.filter((c) => c.trackingEnabled).length,
    tracking: openClickRates(trackedPoints),
  };
}

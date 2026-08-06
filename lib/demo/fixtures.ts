import type { Campaign, DealStatus } from "@/schemas/campaign";
import type { HomeData } from "@/lib/home/dashboard";
import { statsForRange, buildSetupSteps, type HomeRangeKey } from "@/lib/home/dashboard";
import { buildFunnel, buildLeaderboard, sumTotals, type ReportData } from "@/lib/analytics/report";
import { timeToReply, replyHeatmap, bestSendTimes, dailyTrend, openClickRates, type RecipientPoint } from "@/lib/analytics/metrics";

/**
 * Synthetic data for the signed-out product tour at /demo.
 *
 * Nothing here reads Firestore, calls Gmail, or touches an auth context. The
 * demo routes render the same components the real dashboard does, but against
 * these fixtures, so the tour can never leak a real customer's numbers and can
 * never be turned into a way into a real workspace.
 *
 * Numbers describe a healthy but believable account: a 9% reply rate on a
 * mid-five-figure send volume, not a fantasy. Overclaiming here would set an
 * expectation the product then has to live up to.
 */

/** Deterministic pseudo-random, so the demo looks identical on every render
 *  and screenshots stay comparable between deploys. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
/** Fixed clock so the demo never drifts or shows a future date. */
const NOW = Date.UTC(2026, 7, 1, 15, 0, 0);

function campaign(over: Partial<Campaign> & { campaignId: string; name: string }): Campaign {
  return {
    ownerUserId: "demo-user",
    organizationId: "demo-org",
    createdByUserId: "demo-user",
    description: "",
    status: "ACTIVE",
    initialTemplateId: "demo-template",
    templateRotation: [],
    sequenceId: null,
    sourceType: "CONTACTS",
    sourceReference: null,
    schedule: {
      timezone: "America/New_York",
      allowedWeekdays: [1, 2, 3, 4, 5],
      startAt: null,
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
      emailsPerBatch: 12,
      minDelaySeconds: 20,
      maxDelaySeconds: 45,
      interBatchDelayMinutes: 18,
      dailySendLimit: 220,
      pacingMode: "SPREAD",
    },
    gmailQuotaReserve: 50,
    priorContactPolicy: "ONLY_NEW",
    priorContactExcludeDays: 30,
    draftStrategy: "SEND",
    totalRecipients: 0,
    eligibleRecipients: 0,
    excludedRecipients: 0,
    draftedCount: 0,
    sentCount: 0,
    replyCount: 0,
    bounceCount: 0,
    unsubscribeCount: 0,
    followupSentCount: 0,
    errorCount: 0,
    meetingCount: 0,
    wonCount: 0,
    lostCount: 0,
    wonValueCents: 0,
    followupsPaused: false,
    openTrackingEnabled: false,
    clickTrackingEnabled: false,
    trackingEnabled: false,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
    startedAt: NOW - 28 * DAY,
    launchStartedAt: null,
    pausedAt: null,
    deferredDayKey: null,
    archived: false,
    archivedAt: null,
    deletedAt: null,
    resumedAt: null,
    stoppedAt: null,
    completedAt: null,
    ...over,
  };
}

export const DEMO_CAMPAIGNS: Campaign[] = [
  campaign({
    campaignId: "c-founders",
    meetingCount: 71,
    wonCount: 24,
    lostCount: 31,
    wonValueCents: 48600000,
    name: "Series A founders, Q3",
    description: "Warm intro angle, two follow-ups",
    status: "ACTIVE",
    eligibleRecipients: 1840,
    excludedRecipients: 212,
    sentCount: 1410,
    followupSentCount: 980,
    replyCount: 214,
    bounceCount: 19,
    unsubscribeCount: 11,
    totalRecipients: 2052,
    // Clicks only, which is the combination the split exists to allow: a real
    // signal without a remote image in every cold email.
    clickTrackingEnabled: true,
    updatedAt: NOW - 2 * 60 * 60 * 1000,
  }),
  campaign({
    campaignId: "c-agency",
    meetingCount: 29,
    wonCount: 11,
    lostCount: 14,
    wonValueCents: 17250000,
    name: "Agency partnerships",
    status: "ACTIVE",
    eligibleRecipients: 920,
    excludedRecipients: 64,
    sentCount: 760,
    followupSentCount: 410,
    replyCount: 88,
    bounceCount: 7,
    unsubscribeCount: 4,
    totalRecipients: 984,
    updatedAt: NOW - 5 * 60 * 60 * 1000,
  }),
  campaign({
    campaignId: "c-renewals",
    meetingCount: 22,
    wonCount: 9,
    lostCount: 10,
    wonValueCents: 9600000,
    name: "Lapsed accounts, win-back",
    status: "COMPLETED",
    eligibleRecipients: 640,
    excludedRecipients: 38,
    sentCount: 640,
    followupSentCount: 512,
    replyCount: 71,
    bounceCount: 12,
    unsubscribeCount: 9,
    totalRecipients: 678,
    completedAt: NOW - 6 * DAY,
    updatedAt: NOW - 6 * DAY,
  }),
  campaign({
    campaignId: "c-events",
    name: "Conference follow-up, list B",
    status: "PAUSED",
    eligibleRecipients: 430,
    excludedRecipients: 21,
    sentCount: 180,
    followupSentCount: 60,
    replyCount: 24,
    bounceCount: 3,
    unsubscribeCount: 1,
    totalRecipients: 451,
    pausedAt: NOW - 2 * DAY,
    updatedAt: NOW - 2 * DAY,
  }),
  campaign({
    campaignId: "c-newsletter",
    name: "Quarterly customer note",
    status: "DRAFT",
    eligibleRecipients: 0,
    sentCount: 0,
    replyCount: 0,
    updatedAt: NOW - 12 * 60 * 60 * 1000,
  }),
];

/** 14 days of activity with a believable weekday rhythm and a weekend dip. */
export const DEMO_ACTIVITY = (() => {
  const rnd = seeded(20260801);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(NOW - (13 - i) * DAY);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const sent = weekend ? Math.round(18 + rnd() * 22) : Math.round(150 + rnd() * 90);
    return {
      day: d.toISOString().slice(0, 10),
      sent,
      replied: Math.round(sent * (0.06 + rnd() * 0.05)),
    };
  });
})();

const TOTALS = {
  sent: DEMO_CAMPAIGNS.reduce((n, c) => n + c.sentCount + c.followupSentCount, 0),
  replies: DEMO_CAMPAIGNS.reduce((n, c) => n + c.replyCount, 0),
  bounces: DEMO_CAMPAIGNS.reduce((n, c) => n + c.bounceCount, 0),
  unsubscribes: DEMO_CAMPAIGNS.reduce((n, c) => n + c.unsubscribeCount, 0),
  leads: 4820,
};

export function demoHome(range: HomeRangeKey): HomeData {
  const week = DEMO_ACTIVITY.slice(-7);
  const sentThisWeek = week.reduce((a, d) => a + d.sent, 0);
  const repliesThisWeek = week.reduce((a, d) => a + d.replied, 0);
  const today = DEMO_ACTIVITY[DEMO_ACTIVITY.length - 1];
  const active = DEMO_CAMPAIGNS.filter((c) => c.status === "ACTIVE");

  return {
    gmailConnected: true,
    campaigns: DEMO_CAMPAIGNS,
    activeCampaigns: active,
    orgName: "Northwind Partners",
    briefing: {
      status: "SENDING",
      sentence: `${active.length} campaigns are sending right now, and ${repliesThisWeek} people replied this week. Two are marked interested and waiting on you.`,
      suggestions: [
        { href: "/demo/replies", label: "Work the replies", icon: "reply" },
        { href: "/demo/reports", label: "See what is working", icon: "chart" },
      ],
    },
    activity: DEMO_ACTIVITY,
    setupSteps: buildSetupSteps({
      gmailConnected: true,
      totalLeads: TOTALS.leads,
      templateCount: 6,
      hasLaunched: true,
    }),
    setupComplete: true,
    rangeStats: statsForRange(range, {
      today: { sent: today.sent, replies: today.replied },
      week: { sent: sentThisWeek, replies: repliesThisWeek },
      all: { sent: TOTALS.sent, replies: TOTALS.replies },
    }),
    best: { c: DEMO_CAMPAIGNS[0], rate: 8.9 },
    totals: TOTALS,
    bounceRate: (TOTALS.bounces / TOTALS.sent) * 100,
    sentToday: today.sent,
    dailyLimit: 220,
    wonCount: DEMO_CAMPAIGNS.reduce((n, c) => n + c.wonCount, 0),
    wonValueCents: DEMO_CAMPAIGNS.reduce((n, c) => n + c.wonValueCents, 0),
    sentThisWeek,
    repliesThisWeek,
  };
}

/** Recipient-level points backing the timing charts on the demo report. */
const DEMO_POINTS: RecipientPoint[] = (() => {
  const rnd = seeded(77);
  const pts: RecipientPoint[] = [];
  for (let i = 0; i < 900; i++) {
    const sentAt = NOW - Math.floor(rnd() * 30 * DAY);
    const replied = rnd() < 0.09;
    pts.push({
      initialSentAt: sentAt,
      repliedAt: replied ? sentAt + Math.floor(rnd() * 3 * DAY) : null,
      bouncedAt: !replied && rnd() < 0.015 ? sentAt + 3600_000 : null,
      unsubscribedAt: !replied && rnd() < 0.01 ? sentAt + 7200_000 : null,
      openedAt: rnd() < 0.42 ? sentAt + 1800_000 : null,
      firstClickedAt: rnd() < 0.11 ? sentAt + 2400_000 : null,
    });
  }
  return pts;
})();

export function demoReport(rangeDays: 30 | 90 | 365): ReportData {
  const totals = sumTotals(DEMO_CAMPAIGNS);
  const leaderboard = buildLeaderboard(DEMO_CAMPAIGNS);
  const tz = "America/New_York";
  return {
    allCampaigns: DEMO_CAMPAIGNS,
    selectedCampaign: null,
    scopeCampaigns: DEMO_CAMPAIGNS,
    rangeDays,
    activeCount: DEMO_CAMPAIGNS.filter((c) => c.status === "ACTIVE").length,
    scanIsCapped: false,
    totals,
    funnel: buildFunnel(totals),
    leaderboard,
    best: leaderboard[0] ?? null,
    ttr: timeToReply(DEMO_POINTS),
    heatmap: replyHeatmap(DEMO_POINTS, tz),
    bestHours: bestSendTimes(DEMO_POINTS, tz).filter((r) => r.sent >= 2),
    trend: dailyTrend(DEMO_POINTS, tz, rangeDays, NOW),
    trackedCampaignCount: 1,
    tracking: openClickRates(DEMO_POINTS),
  };
}

export interface DemoReply {
  name: string;
  email: string;
  campaign: string;
  intent: "INTERESTED" | "REPLIED" | "NOT_INTERESTED";
  snippet: string;
  repliedAt: number;
  /** Shown so the tour demonstrates the whole loop, including a win with a
   * recorded value and one still waiting on the rep. */
  dealStatus: DealStatus | null;
  dealValueCents: number | null;
}

export const DEMO_REPLIES: DemoReply[] = [
  {
    name: "Priya Raman",
    email: "priya@lumenworks.io",
    dealStatus: "WON",
    dealValueCents: 48_000_00,
    campaign: "Series A founders, Q3",
    intent: "INTERESTED",
    snippet: "This is timely. We are reviewing tooling next month, can you send times for a call?",
    repliedAt: NOW - 3 * 60 * 60 * 1000,
  },
  {
    name: "Daniel Osei",
    email: "d.osei@harborlane.com",
    dealStatus: "MEETING_BOOKED",
    dealValueCents: null,
    campaign: "Agency partnerships",
    intent: "INTERESTED",
    snippet: "Interested. What does pricing look like for a team of nine?",
    repliedAt: NOW - 9 * 60 * 60 * 1000,
  },
  {
    name: "Marta Kowalski",
    email: "marta@brightfield.co",
    dealStatus: null,
    dealValueCents: null,
    campaign: "Series A founders, Q3",
    intent: "REPLIED",
    snippet: "Can you send over the deliverability details before we go further?",
    repliedAt: NOW - 26 * 60 * 60 * 1000,
  },
  {
    name: "Tom Whitfield",
    email: "tom@axlepoint.com",
    dealStatus: null,
    dealValueCents: null,
    campaign: "Lapsed accounts, win-back",
    intent: "REPLIED",
    snippet: "Forwarding to our ops lead, she owns this decision.",
    repliedAt: NOW - 2 * DAY,
  },
  {
    name: "Sofia Marino",
    email: "sofia@velacraft.io",
    dealStatus: null,
    dealValueCents: null,
    campaign: "Conference follow-up, list B",
    intent: "NOT_INTERESTED",
    snippet: "We just signed with someone else, thanks for reaching out.",
    repliedAt: NOW - 3 * DAY,
  },
];

export interface DemoLead {
  name: string;
  business: string;
  email: string;
  campaigns: number;
  sent: number;
  replies: number;
  status: "Ready" | "Contacted" | "Replied" | "Excluded";
}

export const DEMO_LEADS: DemoLead[] = [
  { name: "Priya Raman", business: "Lumenworks", email: "priya@lumenworks.io", campaigns: 2, sent: 3, replies: 1, status: "Replied" },
  { name: "Daniel Osei", business: "Harborlane", email: "d.osei@harborlane.com", campaigns: 1, sent: 2, replies: 1, status: "Replied" },
  { name: "Marta Kowalski", business: "Brightfield", email: "marta@brightfield.co", campaigns: 2, sent: 4, replies: 1, status: "Replied" },
  { name: "Tom Whitfield", business: "Axlepoint", email: "tom@axlepoint.com", campaigns: 3, sent: 5, replies: 1, status: "Replied" },
  { name: "Ana Beltrán", business: "Cortez Media", email: "ana@cortezmedia.mx", campaigns: 1, sent: 2, replies: 0, status: "Contacted" },
  { name: "Jonas Alberts", business: "Northgate Labs", email: "jonas@northgatelabs.se", campaigns: 1, sent: 1, replies: 0, status: "Contacted" },
  { name: "Rae Lindqvist", business: "Fielder & Co", email: "rae@fielder.co", campaigns: 0, sent: 0, replies: 0, status: "Ready" },
  { name: "Ibrahim Nasser", business: "Sandpiper Group", email: "ib@sandpiper.group", campaigns: 0, sent: 0, replies: 0, status: "Ready" },
  { name: "Chloe Duarte", business: "Verano Studio", email: "chloe@verano.studio", campaigns: 2, sent: 3, replies: 0, status: "Excluded" },
];

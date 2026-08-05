import "server-only";

import {
  getDailyActivity,
  getDailyCount,
  listCampaigns,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { countContacts } from "@/lib/repositories/contacts";
import { listTemplates } from "@/lib/repositories/templates";
import { listNotifications } from "@/lib/repositories/notifications";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getOrganization } from "@/lib/repositories/orgSettings";
import { currentDayKey } from "@/lib/scheduling/window";
import { buildBriefing, type Briefing } from "@/lib/home/briefing";
import { totalSent, replyRateForCampaign } from "@/lib/analytics/metrics";
import { campaignsIncludedInWorkspaceStats } from "@/lib/campaigns/lifecycle";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { Campaign } from "@/schemas/campaign";

export type { Briefing };

export type HomeRangeKey = "today" | "7d" | "all";

export interface SetupStep {
  done: boolean;
  label: string;
  desc: string;
  href: string;
  cta: string;
}

export interface RangeStats {
  sent: number;
  replies: number;
  replyRate: number;
  /** How the range reads in a KPI label, e.g. "last 7 days". */
  label: string;
}

/** The four steps from a new account to a first real send. */
export function buildSetupSteps(input: {
  gmailConnected: boolean;
  totalLeads: number;
  templateCount: number;
  hasLaunched: boolean;
}): SetupStep[] {
  return [
    {
      done: input.gmailConnected,
      label: "Connect your Gmail",
      desc: "Send from your own inbox: takes a minute.",
      href: "/settings",
      cta: "Connect",
    },
    {
      done: input.totalLeads > 0,
      label: "Import your leads",
      desc: "Paste from Salesforce or upload a CSV.",
      href: "/leads",
      cta: "Import",
    },
    {
      done: input.templateCount > 0,
      label: "Create a template",
      desc: "Write one yourself or let AI draft it.",
      href: "/templates/new",
      cta: "Create",
    },
    {
      done: input.hasLaunched,
      label: "Launch a test campaign",
      desc: "A few leads in test mode: safe practice.",
      href: "/campaigns/new",
      cta: "Launch",
    },
  ];
}

/** Pick the headline numbers for whichever range tab is active. */
export function statsForRange(
  range: HomeRangeKey,
  buckets: {
    today: { sent: number; replies: number };
    week: { sent: number; replies: number };
    all: { sent: number; replies: number };
  }
): RangeStats {
  const { sent, replies, label } =
    range === "today"
      ? { ...buckets.today, label: "today" }
      : range === "7d"
        ? { ...buckets.week, label: "last 7 days" }
        : { ...buckets.all, label: "all time" };
  return { sent, replies, replyRate: sent > 0 ? (replies / sent) * 100 : 0, label };
}

/** A campaign has left the drafting stage if it has sent or ever ran. */
export function hasEverLaunched(campaigns: Campaign[]): boolean {
  return campaigns.some(
    (c) => c.sentCount > 0 || ["ACTIVE", "PAUSED", "COMPLETED", "STOPPED"].includes(c.status)
  );
}

/** Best reply rate among campaigns with a large enough sample to mean anything. */
export function bestCampaign(campaigns: Campaign[]): { c: Campaign; rate: number } | null {
  return (
    [...campaigns]
      .filter((c) => totalSent(c) >= 5)
      .map((c) => ({ c, rate: replyRateForCampaign(c) }))
      .sort((a, b) => b.rate - a.rate)[0] ?? null
  );
}

/** Time-of-day greeting in the user's own timezone. */
export function greetingFor(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export interface HomeData {
  gmailConnected: boolean;
  campaigns: Campaign[];
  activeCampaigns: Campaign[];
  orgName: string | null;
  briefing: Briefing;
  activity: Array<{ day: string; sent: number; replied: number }>;
  setupSteps: SetupStep[];
  setupComplete: boolean;
  rangeStats: RangeStats;
  best: { c: Campaign; rate: number } | null;
  totals: { sent: number; replies: number; bounces: number; unsubscribes: number; leads: number };
  /** Closed business across every campaign in the workspace. The one number
   * on this page that answers whether any of the activity was worth doing. */
  wonCount: number;
  wonValueCents: number;
  bounceRate: number;
  sentToday: number;
  dailyLimit: number;
  sentThisWeek: number;
  repliesThisWeek: number;
}

/**
 * Everything the home dashboard renders, loaded in one fan-out.
 *
 * The page previously interleaved nine awaits, a dozen reductions, and the
 * checklist definition directly above 270 lines of JSX. Splitting it here
 * keeps the page a readable composition and makes the arithmetic testable.
 */
export async function loadHome(ctx: AuthContext, range: HomeRangeKey): Promise<HomeData> {
  const owner = ownerFromCtx(ctx);
  const tz = ctx.user.timezone;

  const [connection, campaigns, sentToday, profile, org, activity, totalLeads, notifications, templates] =
    await Promise.all([
      getConnectionPublic(ctx.userId),
      listCampaigns(owner, 100),
      getDailyCount(owner, currentDayKey(tz)),
      getSenderProfile(ctx),
      getOrganization(ctx.organizationId),
      getDailyActivity(owner, tz, 14),
      countContacts(ctx),
      listNotifications(ctx, 30),
      listTemplates(ctx),
    ]);

  const visibleCampaigns = campaignsIncludedInWorkspaceStats(campaigns);
  const gmailConnected = connection?.status === "CONNECTED";
  const activeCampaigns = visibleCampaigns.filter((c) => c.status === "ACTIVE");

  // Coerced for the same reason as sumTotals in lib/analytics/report.ts: a
  // campaign written before a counter existed has no such field, and one
  // undefined makes the whole figure NaN on every existing customer's home
  // page the day the counter ships.
  const sum = (pick: (c: Campaign) => number) =>
    visibleCampaigns.reduce((n, c) => n + (Number(pick(c)) || 0), 0);
  const totals = {
    sent: sum(totalSent),
    replies: sum((c) => c.replyCount),
    bounces: sum((c) => c.bounceCount),
    unsubscribes: sum((c) => c.unsubscribeCount),
    leads: totalLeads,
  };

  const lastSeven = activity.slice(-7);
  const sentThisWeek = lastSeven.reduce((a, d) => a + d.sent, 0);
  const repliesThisWeek = lastSeven.reduce((a, d) => a + d.replied, 0);
  const today = activity[activity.length - 1];

  const setupSteps = buildSetupSteps({
    gmailConnected,
    totalLeads,
    templateCount: templates.length,
    hasLaunched: hasEverLaunched(visibleCampaigns),
  });

  return {
    gmailConnected,
    campaigns: visibleCampaigns,
    activeCampaigns,
    orgName: org?.name ?? null,
    briefing: buildBriefing({
      gmailConnected,
      activeCampaigns: activeCampaigns.length,
      unreadReplies: notifications.filter((n) => n.type === "REPLY" && !n.read).length,
      repliesThisWeek,
      sentThisWeek,
      totalLeads,
      hasCampaigns: visibleCampaigns.length > 0,
    }),
    activity,
    setupSteps,
    setupComplete: setupSteps.every((s) => s.done),
    rangeStats: statsForRange(range, {
      today: { sent: today?.sent ?? sentToday, replies: today?.replied ?? 0 },
      week: { sent: sentThisWeek, replies: repliesThisWeek },
      all: { sent: totals.sent, replies: totals.replies },
    }),
    best: bestCampaign(visibleCampaigns),
    totals,
    bounceRate: totals.sent > 0 ? (totals.bounces / totals.sent) * 100 : 0,
    wonCount: sum((c) => c.wonCount),
    wonValueCents: sum((c) => c.wonValueCents),
    sentToday,
    dailyLimit: profile.sendingDefaults.dailySendLimit,
    sentThisWeek,
    repliesThisWeek,
  };
}

import { requireUser } from "@/lib/auth/requireUser";
import { type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid, type StatTone } from "@/components/ui/StatTile";
import { RangeTabs, type HomeRange } from "@/components/home/RangeTabs";
import {
  HomeHero,
  GmailNudge,
  DailyAllowanceTile,
  SetupChecklist,
  LiveCampaignCards,
  QuickActions,
  RecentCampaigns,
} from "@/components/home/HomeSections";
import { SignalReel, type Signal } from "@/components/home/SignalReel";
import { loadHome, greetingFor } from "@/lib/home/dashboard";

/**
 * The dashboard home. Loading and arithmetic live in lib/home/dashboard.ts;
 * each block lives in components/home/HomeSections.tsx. What is left here is
 * the composition: which blocks a customer sees, and in what order.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireUser();
  const { range: rawRange } = await searchParams;
  const range: HomeRange = rawRange === "today" || rawRange === "7d" ? rawRange : "all";

  const home = await loadHome(ctx, range);
  const { rangeStats, totals } = home;

  const orbs: Array<{
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    prefix?: string;
    /** No denominator yet, so a percentage would be a lie. */
    dash?: boolean;
    icon: IconName;
    tone: StatTone;
    href: string;
  }> = [
    {
      label: `Emails sent · ${rangeStats.label}`,
      value: rangeStats.sent,
      icon: "mail",
      tone: "default",
      href: "/reports",
    },
    {
      label: `Replies · ${rangeStats.label}`,
      value: rangeStats.replies,
      icon: "reply",
      tone: rangeStats.replies > 0 ? "revenue" : "default",
      href: "/replies",
    },
    {
      label: `Reply rate · ${rangeStats.label}`,
      value: rangeStats.replyRate,
      decimals: 1,
      suffix: "%",
      dash: rangeStats.sent === 0,
      icon: "chart",
      tone: "success",
      href: "/reports",
    },
    {
      label: "Sending now",
      value: home.activeCampaigns.length,
      icon: "rocket",
      tone: "primary",
      href: "/campaigns",
    },
    {
      label: "Total leads",
      value: totals.leads,
      icon: "users",
      tone: "default",
      href: "/leads",
    },
    {
      label: "Bounce rate",
      value: home.bounceRate,
      decimals: 1,
      suffix: "%",
      dash: totals.sent === 0,
      icon: "alert",
      tone: home.bounceRate > 3 ? "danger" : "default",
      href: "/deliverability",
    },
    {
      label: "Unsubscribes",
      value: totals.unsubscribes,
      icon: "ban",
      tone: "default",
      href: "/suppressions",
    },
  ];

  /**
   * The rotating headline band.
   *
   * Every entry is gated on the data that would make it true. A reel that pads
   * itself out with "0 replies this week" and "$0 won" to reach a respectable
   * number of slides is worse than a short one: it teaches a new customer that
   * the band is decoration, which is exactly what the static tile grid already
   * risked. An empty array renders nothing at all.
   */
  const signals: Signal[] = [];

  if (home.repliesThisWeek > 0) {
    signals.push({
      kicker: "Replies this week",
      value: home.repliesThisWeek,
      sentence:
        "Every reply lands in your own Gmail inbox, and any follow-up still queued for that person stops automatically.",
      icon: "reply",
      href: "/replies",
      cta: "Open replies",
      tone: "revenue",
    });
  }

  if (home.best) {
    signals.push({
      kicker: `Best performer · ${home.best.c.name}`,
      value: home.best.rate,
      decimals: 1,
      suffix: "%",
      sentence:
        "Your strongest reply rate so far. Worth looking at what that subject line and opening did differently before writing the next one.",
      icon: "chart",
      href: `/campaigns/${home.best.c.campaignId}`,
      cta: "View campaign",
    });
  }

  if (home.wonCount > 0) {
    signals.push({
      kicker: "Revenue won",
      value: home.wonValueCents / 100,
      prefix: "$",
      sentence: `Closed from ${home.wonCount} ${home.wonCount === 1 ? "deal" : "deals"} traced back to outreach in this workspace.`,
      icon: "chart",
      href: "/reports",
      cta: "See the report",
      tone: "revenue",
    });
  }

  if (totals.sent > 0 && home.bounceRate > 3) {
    signals.push({
      kicker: "Bounce rate needs attention",
      value: home.bounceRate,
      decimals: 1,
      suffix: "%",
      sentence:
        "Above 3% puts your sending reputation at risk. Cleaning the list is the fastest way to bring this down.",
      icon: "alert",
      href: "/deliverability",
      cta: "Check deliverability",
      tone: "warning",
    });
  }

  if (home.activeCampaigns.length > 0) {
    signals.push({
      kicker: "Sending right now",
      value: home.activeCampaigns.length,
      sentence:
        "Paced across the day rather than sent in one burst, which is what keeps a Gmail account in good standing.",
      icon: "rocket",
      href: "/campaigns",
      cta: "View campaigns",
    });
  }

  if (totals.leads > 0 && signals.length < 2) {
    // A quiet workspace still deserves one true thing to look at.
    signals.push({
      kicker: "Leads ready",
      value: totals.leads,
      sentence: "Imported and available to send to. Pick a slice of them to start a campaign.",
      icon: "users",
      href: "/leads",
      cta: "Open leads",
    });
  }

  // Only once there is something to show. A new workspace greeted by a
  // permanent $0 learns that the number is decoration.
  if (home.wonCount > 0) {
    orbs.splice(3, 0, {
      label: "Revenue won",
      value: home.wonValueCents / 100,
      decimals: 0,
      prefix: "$",
      icon: "chart",
      tone: "revenue",
      href: "/reports",
    });
  }

  return (
    <div className="space-y-6">
      <HomeHero
        greeting={greetingFor(ctx.user.timezone)}
        firstName={ctx.user.displayName.split(" ")[0] || "there"}
        orgName={home.orgName}
        briefing={home.briefing}
        activity={home.activity}
        isSendingNow={home.activeCampaigns.length > 0}
        sentThisWeek={home.sentThisWeek}
        repliesThisWeek={home.repliesThisWeek}
      />

      {!home.gmailConnected && <GmailNudge />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Your numbers
        </h2>
        <RangeTabs active={range} />
      </div>

      <SignalReel signals={signals} />

      <StatGrid columns={4}>
        {orbs.map((o) => (
          <StatTile
            key={o.label}
            label={o.label}
            href={o.href}
            icon={o.icon}
            tone={o.dash ? "default" : o.tone}
            value={
              o.dash ? (
                <span className="text-xl text-muted">Not available</span>
              ) : (
                <CountUp
                  value={o.value}
                  decimals={o.decimals}
                  prefix={o.prefix}
                  suffix={o.suffix}
                />
              )
            }
          />
        ))}
        <DailyAllowanceTile sentToday={home.sentToday} dailyLimit={home.dailyLimit} />
      </StatGrid>

      {!home.setupComplete ? (
        <SetupChecklist steps={home.setupSteps} />
      ) : home.activeCampaigns.length > 0 ? (
        <LiveCampaignCards campaigns={home.activeCampaigns} />
      ) : (
        <QuickActions />
      )}

      {home.campaigns.length > 0 && <RecentCampaigns campaigns={home.campaigns} />}
    </div>
  );
}

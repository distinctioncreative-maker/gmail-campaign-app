import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { Icon, type IconName } from "@/components/ui/Icon";
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

      {home.best && (
        <Link
          href={`/campaigns/${home.best.c.campaignId}`}
          className="card card-hover flex items-center justify-between gap-3 bg-surface-2 p-4"
        >
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Icon name="chart" size={16} className="shrink-0" aria-hidden />
            <span>
              Top campaign: <strong>{home.best.c.name}</strong> at{" "}
              {home.best.rate.toFixed(1)}% reply rate
            </span>
          </span>
          <span aria-hidden className="text-foreground">
            →
          </span>
        </Link>
      )}

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
                <CountUp value={o.value} decimals={o.decimals} suffix={o.suffix} />
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

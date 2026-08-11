import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid, type StatTone } from "@/components/ui/StatTile";
import {
  HomeHero,
  DailyAllowanceTile,
  LiveCampaignCards,
  RecentCampaigns,
} from "@/components/home/HomeSections";
import { demoHome } from "@/lib/demo/fixtures";

/** The tour's home screen, rendered from the same components as the real one. */
export default async function DemoHomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: raw } = await searchParams;
  const range = raw === "today" || raw === "7d" ? raw : "all";
  const home = demoHome(range);
  const { rangeStats, totals } = home;

  const orbs: Array<{
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    icon: IconName;
    tone: StatTone;
    href: string;
  }> = [
    { label: `Emails sent · ${rangeStats.label}`, value: rangeStats.sent, icon: "mail", tone: "default", href: "/demo/reports" },
    { label: `Replies · ${rangeStats.label}`, value: rangeStats.replies, icon: "reply", tone: "revenue", href: "/demo/replies" },
    { label: `Reply rate · ${rangeStats.label}`, value: rangeStats.replyRate, decimals: 1, suffix: "%", icon: "chart", tone: "success", href: "/demo/reports" },
    { label: "Sending now", value: home.activeCampaigns.length, icon: "rocket", tone: "primary", href: "/demo/campaigns" },
    { label: "Total leads", value: totals.leads, icon: "users", tone: "default", href: "/demo/leads" },
    { label: "Bounce rate", value: home.bounceRate, decimals: 1, suffix: "%", icon: "alert", tone: "default", href: "/demo/reports" },
    { label: "Unsubscribes", value: totals.unsubscribes, icon: "ban", tone: "default", href: "/demo/leads" },
  ];

  return (
    <div className="space-y-6">
      <HomeHero
        greeting="Good afternoon"
        firstName="Alex"
        orgName={home.orgName}
        briefing={home.briefing}
        activity={home.activity}
        isSendingNow
        sentThisWeek={home.sentThisWeek}
        repliesThisWeek={home.repliesThisWeek}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Your numbers
        </h2>
        <div className="flex overflow-hidden rounded-sm border border-border bg-surface text-xs">
          {(
            [
              ["all", "All time"],
              ["7d", "7 days"],
              ["today", "Today"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === "all" ? "/demo" : `/demo?range=${key}`}
              className={`border-r border-border px-3.5 py-1.5 font-medium transition last:border-r-0 ${
                range === key
                  ? "bg-foreground text-surface"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {home.best && (
        <Link
          href="/demo/reports"
          className="card p-5 sm:p-6 card-hover flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2 text-sm">
            <Icon name="chart" size={16} className="shrink-0 text-muted" aria-hidden />
            <span>
              Top campaign: <strong>{home.best.c.name}</strong> at {home.best.rate.toFixed(1)}% reply
              rate
            </span>
          </span>
          <span aria-hidden className="text-muted">
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
            tone={o.tone}
            value={<CountUp value={o.value} decimals={o.decimals} suffix={o.suffix} />}
          />
        ))}
        <DailyAllowanceTile sentToday={home.sentToday} dailyLimit={home.dailyLimit} />
      </StatGrid>

      <LiveCampaignCards campaigns={home.activeCampaigns} />
      <RecentCampaigns campaigns={home.campaigns} />
    </div>
  );
}

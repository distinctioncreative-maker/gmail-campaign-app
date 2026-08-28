import Link from "next/link";
import { Meter } from "@/components/ui/charts/Meter";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";
import { PulseChart } from "@/components/home/PulseChart";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { totalSent } from "@/lib/analytics/metrics";
import type { Briefing, SetupStep } from "@/lib/home/dashboard";
import type { Campaign } from "@/schemas/campaign";

/**
 * The presentational half of the dashboard home page. Each block takes the
 * data it draws and nothing more, which keeps the page file a readable list
 * of what a customer sees rather than 270 lines of nested JSX.
 */

const STATUS_PILL: Record<string, { label: string; className: string; dot: string }> = {
  SENDING: { label: "Sending live", className: "text-foreground", dot: "bg-primary" },
  REPLIES: { label: "Replies waiting", className: "text-success", dot: "bg-success" },
  READY: { label: "Systems ready", className: "text-muted", dot: "bg-muted" },
  SETUP: { label: "Setup needed", className: "text-warning", dot: "bg-warning" },
};

export function HomeHero({
  greeting,
  firstName,
  orgName,
  briefing,
  activity,
  isSendingNow,
  sentThisWeek,
  repliesThisWeek,
}: {
  greeting: string;
  firstName: string;
  orgName: string | null;
  briefing: Briefing;
  activity: Array<{ day: string; sent: number; replied: number }>;
  isSendingNow: boolean;
  sentThisWeek: number;
  repliesThisWeek: number;
}) {
  const pill = STATUS_PILL[briefing.status] ?? STATUS_PILL.READY;
  return (
    <section className="jarvis-hero p-6 md:p-8">
      <div className="drift-field" aria-hidden />
      <div className="relative grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${pill.className}`}
          >
            <span aria-hidden className={`live-dot h-1.5 w-1.5 rounded-full ${pill.dot}`} />
            {pill.label}
            {orgName && <span className="text-muted">· {orgName}</span>}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-muted">{briefing.sentence}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {briefing.suggestions.map((s, i) => (
              <Link
                key={s.href}
                href={s.href}
                className={
                  i === 0 ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={s.icon as IconName} size={15} />
                  {s.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div
          className="rounded-lg border border-border p-4 backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--surface) 65%, transparent)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
              Activity · 14 days
            </p>
            {isSendingNow ? (
              <LiveRefresh intervalMs={15000} />
            ) : (
              <p className="text-xs tabular-nums text-muted">
                <span className="font-semibold text-foreground">
                  <CountUp value={sentThisWeek} />
                </span>{" "}
                sent ·{" "}
                <span className="font-semibold text-success">
                  <CountUp value={repliesThisWeek} />
                </span>{" "}
                replies this week
              </p>
            )}
          </div>
          <PulseChart data={activity} />
        </div>
      </div>
    </section>
  );
}

/** How much of today's self-imposed sending allowance is spent. */
export function DailyAllowanceTile({
  sentToday,
  dailyLimit,
}: {
  sentToday: number;
  dailyLimit: number;
}) {
  const pct = dailyLimit > 0 ? Math.min(100, (sentToday / dailyLimit) * 100) : 0;
  const remaining = Math.max(0, dailyLimit - sentToday);
  return (
    <Link href="/settings" className="group block bg-surface p-6 transition-colors duration-(--dur-base) hover:bg-surface-2">
      <p className="display-label leading-none">Today&apos;s sending</p>
      <div className="mt-4 flex items-center gap-3">
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--surface-2) 0deg)` }}
          aria-hidden
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
            style={{ background: "var(--surface)" }}
          >
            <CountUp value={Math.round(pct)} suffix="%" />
          </div>
        </div>
        <div className="text-sm">
          <p className="display-figure">
            <CountUp value={sentToday} /> / {dailyLimit}
          </p>
          <p className="text-xs text-muted">{remaining} left today</p>
        </div>
      </div>
    </Link>
  );
}

/** The four steps from a new account to a first real send. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          Get set up: {done} of {steps.length} done
        </h2>
        <span className="text-xs font-medium text-muted">
          A few minutes to your first send
        </span>
      </div>
      <Meter value={done} max={steps.length} tone="good" height={6} className="mt-3 w-full" />
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                s.done
                  ? "border-transparent bg-surface-2"
                  : isNext
                    ? "border-border bg-surface-2"
                    : "border-border"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? "bg-success text-success-contrast" : "border border-border text-muted"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? "text-muted line-through" : ""}`}>
                  {s.label}
                </p>
                {!s.done && <p className="text-xs text-muted">{s.desc}</p>}
              </div>
              {!s.done && (
                <Link
                  href={s.href}
                  className={
                    isNext
                      ? "btn-primary px-3.5 py-1.5 text-xs"
                      : "text-xs font-medium text-foreground link"
                  }
                >
                  {s.cta} →
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Progress cards for the campaigns sending right now. */
export function LiveCampaignCards({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Live campaigns</h2>
        <Link href="/campaigns" className="text-sm font-medium text-foreground link">
          View all
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {campaigns.slice(0, 4).map((c) => {
          const sent = totalSent(c);
          const total = Math.max(sent, c.totalRecipients || sent);
          const pct = total > 0 ? Math.min(100, (sent / total) * 100) : 0;
          return (
            <Link
              key={c.campaignId}
              href={`/campaigns/${c.campaignId}`}
              className="card p-6 sm:p-7 card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{c.name}</p>
                <span className="live-dot flex items-center gap-1 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> sending
                </span>
              </div>
              <Meter value={pct} tone="good" height={8} className="mt-3" />
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span className="tabular-nums">
                  {sent} of {total} sent
                </span>
                <span className="tabular-nums">{c.replyCount} replies</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const QUICK_ACTIONS: Array<{ href: string; icon: IconName; title: string; desc: string }> = [
  {
    href: "/campaigns/new",
    icon: "rocket",
    title: "Create a campaign",
    desc: "Pick leads, an email, and a schedule.",
  },
  {
    href: "/replies",
    icon: "check",
    title: "See who replied",
    desc: "Every reply across your campaigns, in one inbox.",
  },
  {
    href: "/leads",
    icon: "users",
    title: "Import leads",
    desc: "Paste from Salesforce or upload a CSV.",
  },
  {
    href: "/templates/new",
    icon: "mail",
    title: "Build a template",
    desc: "Design one yourself or write it with AI.",
  },
];

/** Shown once setup is complete but nothing is sending. */
export function QuickActions() {
  return (
    <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {QUICK_ACTIONS.map((a) => (
        <Link key={a.href} href={a.href} className="card p-6 sm:p-7 card-hover group">
          <span
            aria-hidden
            className="bg-surface-2 text-foreground flex h-11 w-11 items-center justify-center rounded-lg text-brand-contrast shadow-md transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-105"
          >
            <Icon name={a.icon} size={22} />
          </span>
          <p className="mt-3 font-semibold group-hover:text-foreground">{a.title}</p>
          <p className="mt-1 text-sm text-muted">{a.desc}</p>
        </Link>
      ))}
    </div>
  );
}

export function RecentCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Recent campaigns</h2>
        <Link href="/campaigns" className="text-sm font-medium text-foreground link">
          View all
        </Link>
      </div>
      <div className="card divide-y divide-border overflow-hidden">
        {campaigns.slice(0, 5).map((c) => {
          const badge = CAMPAIGN_STATUS_LABELS[c.status];
          return (
            <Link
              key={c.campaignId}
              href={`/campaigns/${c.campaignId}`}
              className="flex items-center justify-between p-4 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted">
                  {totalSent(c)} sent · {c.replyCount} replies
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Only rendered when Gmail is not connected, since nothing can send without it. */
export function GmailNudge() {
  return (
    <div className="card p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3 ring-1 ring-warning/30">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning"
        >
          <Icon name="alert" size={18} />
        </span>
        <div>
          <p className="text-sm font-medium">Gmail not connected</p>
          <p className="text-xs text-muted">Connect it to start sending.</p>
        </div>
      </div>
      <Link href="/settings" className="btn-primary px-4 py-2 text-sm">
        Connect Gmail
      </Link>
    </div>
  );
}

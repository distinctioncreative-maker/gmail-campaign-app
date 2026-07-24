import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import {
  getDailyActivity,
  getDailyCount,
  listCampaigns,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { countContacts } from "@/lib/repositories/contacts";
import { listTemplates } from "@/lib/repositories/templates";
import { listNotifications } from "@/lib/repositories/notifications";
import { currentDayKey } from "@/lib/scheduling/window";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getOrganization } from "@/lib/repositories/orgSettings";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PulseChart } from "@/components/home/PulseChart";
import { CountUp } from "@/components/home/CountUp";
import { RangeTabs, type HomeRange } from "@/components/home/RangeTabs";
import { LiveRefresh } from "@/components/LiveRefresh";
import { buildBriefing } from "@/lib/home/briefing";

/** Time-of-day greeting in the user's timezone. */
function greetingFor(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(
      new Date()
    )
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS_PILL: Record<string, { label: string; className: string; dot: string }> = {
  SENDING: { label: "Sending live", className: "text-primary", dot: "bg-primary" },
  REPLIES: { label: "Replies waiting", className: "text-green-600", dot: "bg-green-500" },
  READY: { label: "Systems ready", className: "text-slate-500", dot: "bg-slate-400" },
  SETUP: { label: "Setup needed", className: "text-amber-600", dot: "bg-amber-500" },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const tz = ctx.user.timezone;
  const { range: rawRange } = await searchParams;
  const range: HomeRange = rawRange === "today" || rawRange === "7d" ? rawRange : "all";

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

  const gmailConnected = connection?.status === "CONNECTED";
  const active = campaigns.filter((c) => c.status === "ACTIVE");

  // First-win checklist: the four steps that take a new rep from zero to a
  // running (test) campaign. Each "done" flag comes from real data.
  const hasLaunched = campaigns.some(
    (c) => c.sentCount > 0 || ["ACTIVE", "PAUSED", "COMPLETED", "STOPPED"].includes(c.status)
  );
  const setupSteps = [
    { done: gmailConnected, label: "Connect your Gmail", desc: "Send from your own inbox — takes a minute.", href: "/settings", cta: "Connect" },
    { done: totalLeads > 0, label: "Import your leads", desc: "Paste from Salesforce or upload a CSV.", href: "/leads", cta: "Import" },
    { done: templates.length > 0, label: "Create a template", desc: "Write one yourself or let AI draft it.", href: "/templates/new", cta: "Create" },
    { done: hasLaunched, label: "Launch a test campaign", desc: "A few leads in test mode — safe practice.", href: "/campaigns/new", cta: "Launch" },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const nextStepIdx = setupSteps.findIndex((s) => !s.done);
  const totalReplies = campaigns.reduce((n, c) => n + c.replyCount, 0);
  const totalSentAll = campaigns.reduce((n, c) => n + c.sentCount + c.followupSentCount, 0);
  const totalBounces = campaigns.reduce((n, c) => n + c.bounceCount, 0);
  const totalUnsub = campaigns.reduce((n, c) => n + c.unsubscribeCount, 0);
  const dailyLimit = profile.sendingDefaults.dailySendLimit;
  const dailyRemaining = Math.max(0, dailyLimit - sentToday);
  const dailyPct = dailyLimit > 0 ? Math.min(100, (sentToday / dailyLimit) * 100) : 0;

  const sentThisWeek = activity.slice(-7).reduce((a, d) => a + d.sent, 0);
  const repliesThisWeek = activity.slice(-7).reduce((a, d) => a + d.replied, 0);
  const unreadReplies = notifications.filter((n) => n.type === "REPLY" && !n.read).length;

  // Range-aware headline metrics (sent / replies / reply rate).
  const todaySent = activity[activity.length - 1]?.sent ?? sentToday;
  const todayReplies = activity[activity.length - 1]?.replied ?? 0;
  const rangeStats =
    range === "today"
      ? { sent: todaySent, replies: todayReplies, label: "today" }
      : range === "7d"
        ? { sent: sentThisWeek, replies: repliesThisWeek, label: "last 7 days" }
        : { sent: totalSentAll, replies: totalReplies, label: "all time" };
  const rangeReplyRate = rangeStats.sent > 0 ? (rangeStats.replies / rangeStats.sent) * 100 : 0;
  const bounceRate = totalSentAll > 0 ? (totalBounces / totalSentAll) * 100 : 0;

  // Best campaign by reply rate (with a meaningful sample).
  const best = [...campaigns]
    .filter((c) => c.sentCount + c.followupSentCount >= 5)
    .map((c) => ({ c, rate: (c.replyCount / (c.sentCount + c.followupSentCount)) * 100 }))
    .sort((a, b) => b.rate - a.rate)[0];

  const briefing = buildBriefing({
    gmailConnected,
    activeCampaigns: active.length,
    unreadReplies,
    repliesThisWeek,
    sentThisWeek,
    totalLeads,
    hasCampaigns: campaigns.length > 0,
  });
  const pill = STATUS_PILL[briefing.status];
  const firstName = ctx.user.displayName.split(" ")[0] || "there";

  const orbs: Array<{
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    dash?: boolean;
    icon: IconName;
    accent: string;
    href: string;
  }> = [
    { label: `Emails sent · ${rangeStats.label}`, value: rangeStats.sent, icon: "mail", accent: "text-slate-900", href: "/reports" },
    { label: `Replies · ${rangeStats.label}`, value: rangeStats.replies, icon: "reply", accent: "text-green-600", href: "/replies" },
    { label: `Reply rate · ${rangeStats.label}`, value: rangeReplyRate, decimals: 1, suffix: "%", dash: rangeStats.sent === 0, icon: "chart", accent: "text-indigo-500", href: "/reports" },
    { label: "Sending now", value: active.length, icon: "rocket", accent: "text-primary", href: "/campaigns" },
    { label: "Total leads", value: totalLeads, icon: "users", accent: "text-slate-900", href: "/leads" },
    { label: "Bounce rate", value: bounceRate, decimals: 1, suffix: "%", dash: totalSentAll === 0, icon: "alert", accent: bounceRate > 3 ? "text-red-600" : "text-slate-900", href: "/deliverability" },
    { label: "Unsubscribes", value: totalUnsub, icon: "ban", accent: "text-slate-900", href: "/suppressions" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Mission-control hero ─────────────────────────────── */}
      <section className="jarvis-hero p-6 md:p-8">
        <div className="aurora" aria-hidden>
          <span className="aurora-blob b1" />
          <span className="aurora-blob b2" />
          <span className="aurora-blob b3" />
        </div>
        <div className="relative grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${pill.className}`}>
              <span aria-hidden className={`live-dot h-1.5 w-1.5 rounded-full ${pill.dot}`} />
              {pill.label}
              {org?.name && <span className="text-slate-400">· {org.name}</span>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {greetingFor(tz)}, {firstName}.
            </h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
              {briefing.sentence}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {briefing.suggestions.map((s, i) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className={i === 0 ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={s.icon as IconName} size={15} />
                    {s.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Pulse chart */}
          <div
            className="rounded-2xl border border-border p-4 backdrop-blur"
            style={{ background: "color-mix(in srgb, var(--surface) 65%, transparent)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                Activity · 14 days
              </p>
              {active.length > 0 ? (
                <LiveRefresh intervalMs={15000} />
              ) : (
                <p className="text-xs tabular-nums text-slate-500">
                  <span className="font-semibold text-slate-900"><CountUp value={sentThisWeek} /></span> sent ·{" "}
                  <span className="font-semibold text-green-600"><CountUp value={repliesThisWeek} /></span> replies this week
                </p>
              )}
            </div>
            <PulseChart data={activity} />
          </div>
        </div>
      </section>

      {/* ── Gmail connection nudge (only if needed) ───────────── */}
      {!gmailConnected && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 ring-1 ring-amber-200">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Icon name="alert" size={18} />
            </span>
            <div>
              <p className="text-sm font-medium">Gmail not connected</p>
              <p className="text-xs text-slate-500">Connect it to start sending.</p>
            </div>
          </div>
          <Link href="/settings" className="btn-primary px-4 py-2 text-sm">Connect Gmail</Link>
        </div>
      )}

      {/* ── KPI header: range switch ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your numbers</h2>
        <RangeTabs active={range} />
      </div>

      {best && (
        <Link
          href={`/campaigns/${best.c.campaignId}`}
          className="card card-hover flex items-center justify-between gap-3 bg-primary-soft/50 p-4"
        >
          <span className="text-sm text-primary">
            🏆 Top campaign: <strong>{best.c.name}</strong> at {best.rate.toFixed(1)}% reply rate
          </span>
          <span aria-hidden className="text-primary">→</span>
        </Link>
      )}

      {/* ── Stat orbs + daily allowance ring ──────────────────── */}
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {orbs.map((o) => (
          <Link key={o.label} href={o.href} className="card card-hover group p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{o.label}</p>
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110">
                <Icon name={o.icon} size={16} />
              </span>
            </div>
            <p className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${o.accent}`}>
              {o.dash ? "—" : <CountUp value={o.value} decimals={o.decimals} suffix={o.suffix} />}
            </p>
            <span className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:text-primary">
              View <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        ))}

        {/* Daily allowance ring */}
        <Link href="/settings" className="card card-hover group p-5">
          <p className="text-sm font-medium text-slate-500">Today&apos;s sending</p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(var(--primary) ${dailyPct * 3.6}deg, var(--surface-2) 0deg)` }}
              aria-hidden
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                style={{ background: "var(--surface)" }}
              >
                <CountUp value={Math.round(dailyPct)} suffix="%" />
              </div>
            </div>
            <div className="text-sm">
              <p className="font-semibold tabular-nums">
                <CountUp value={sentToday} /> / {dailyLimit}
              </p>
              <p className="text-xs text-slate-500">{dailyRemaining} left today</p>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Onboarding vs live campaigns ──────────────────────── */}
      {setupDone < setupSteps.length ? (
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Get set up — {setupDone} of {setupSteps.length} done</h2>
            <span className="text-xs font-medium text-slate-400">A few minutes to your first send</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full brand-gradient transition-all duration-500"
              style={{ width: `${(setupDone / setupSteps.length) * 100}%` }}
            />
          </div>
          <ol className="mt-4 flex flex-col gap-2">
            {setupSteps.map((s, i) => {
              const isNext = i === nextStepIdx;
              return (
                <li
                  key={s.label}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    s.done
                      ? "border-transparent bg-slate-50"
                      : isNext
                        ? "border-primary/30 bg-primary-soft/50"
                        : "border-border"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.done ? "bg-green-500 text-white" : "border border-slate-300 text-slate-400"
                    }`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${s.done ? "text-slate-400 line-through" : ""}`}>{s.label}</p>
                    {!s.done && <p className="text-xs text-slate-500">{s.desc}</p>}
                  </div>
                  {!s.done && (
                    <Link
                      href={s.href}
                      className={isNext ? "btn-primary px-3.5 py-1.5 text-xs" : "text-xs font-medium text-primary hover:underline"}
                    >
                      {s.cta} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : active.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Live campaigns</h2>
            <Link href="/campaigns" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {active.slice(0, 4).map((c) => {
              const sent = c.sentCount + c.followupSentCount;
              const total = Math.max(sent, c.totalRecipients || sent);
              const pct = total > 0 ? Math.min(100, (sent / total) * 100) : 0;
              return (
                <Link key={c.campaignId} href={`/campaigns/${c.campaignId}`} className="card card-hover p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{c.name}</p>
                    <span className="live-dot flex items-center gap-1 text-xs font-medium text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> sending
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="brand-gradient h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="tabular-nums">{sent} of {total} sent</span>
                    <span className="tabular-nums text-green-600">{c.replyCount} replies</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { href: "/campaigns/new", icon: "rocket", title: "Create a campaign", desc: "Pick leads, an email, and a schedule." },
            { href: "/replies", icon: "check", title: "See who replied", desc: "Every reply across your campaigns, in one inbox." },
            { href: "/leads", icon: "users", title: "Import leads", desc: "Paste from Salesforce or upload a CSV." },
            { href: "/templates/new", icon: "mail", title: "Build a template", desc: "Design one yourself or write it with AI." },
          ] as Array<{ href: string; icon: IconName; title: string; desc: string }>).map((a) => (
            <Link key={a.href} href={a.href} className="card card-hover group p-5">
              <span aria-hidden className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md">
                <Icon name={a.icon} size={22} />
              </span>
              <p className="mt-3 font-semibold group-hover:text-primary">{a.title}</p>
              <p className="mt-1 text-sm text-slate-500">{a.desc}</p>
            </Link>
          ))}
        </div>
      )}

      {/* ── Recent campaigns list ─────────────────────────────── */}
      {campaigns.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Recent campaigns</h2>
            <Link href="/campaigns" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {campaigns.slice(0, 5).map((c) => {
              const badge = CAMPAIGN_STATUS_LABELS[c.status];
              return (
                <Link key={c.campaignId} href={`/campaigns/${c.campaignId}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.sentCount + c.followupSentCount} sent · {c.replyCount} replies
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
import { listNotifications } from "@/lib/repositories/notifications";
import { currentDayKey } from "@/lib/scheduling/window";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getOrganization } from "@/lib/repositories/orgSettings";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PulseChart } from "@/components/home/PulseChart";
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

export default async function HomePage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const tz = ctx.user.timezone;

  const [connection, campaigns, sentToday, profile, org, activity, totalLeads, notifications] =
    await Promise.all([
      getConnectionPublic(ctx.userId),
      listCampaigns(owner, 100),
      getDailyCount(owner, currentDayKey(tz)),
      getSenderProfile(ctx),
      getOrganization(ctx.organizationId),
      getDailyActivity(owner, tz, 14),
      countContacts(ctx),
      listNotifications(ctx, 30),
    ]);

  const gmailConnected = connection?.status === "CONNECTED";
  const active = campaigns.filter((c) => c.status === "ACTIVE");
  const totalReplies = campaigns.reduce((n, c) => n + c.replyCount, 0);
  const totalSentAll = campaigns.reduce((n, c) => n + c.sentCount + c.followupSentCount, 0);
  const replyRate = totalSentAll > 0 ? (totalReplies / totalSentAll) * 100 : 0;
  const dailyLimit = profile.sendingDefaults.dailySendLimit;
  const dailyRemaining = Math.max(0, dailyLimit - sentToday);
  const dailyPct = dailyLimit > 0 ? Math.min(100, (sentToday / dailyLimit) * 100) : 0;

  const sentThisWeek = activity.slice(-7).reduce((a, d) => a + d.sent, 0);
  const repliesThisWeek = activity.slice(-7).reduce((a, d) => a + d.replied, 0);
  const unreadReplies = notifications.filter((n) => n.type === "REPLY" && !n.read).length;

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

  const orbs: Array<{ label: string; value: string; icon: IconName; accent: string }> = [
    { label: "Sending now", value: String(active.length), icon: "rocket", accent: "text-primary" },
    { label: "Replies (all time)", value: String(totalReplies), icon: "reply", accent: "text-green-600" },
    { label: "Reply rate", value: totalSentAll > 0 ? `${replyRate.toFixed(1)}%` : "—", icon: "chart", accent: "text-indigo-500" },
    { label: "Leads", value: totalLeads.toLocaleString(), icon: "users", accent: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Mission-control hero ─────────────────────────────── */}
      <section className="jarvis-hero p-6 md:p-8">
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
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Activity · 14 days</p>
              <p className="text-xs tabular-nums text-slate-500">
                <span className="font-semibold text-slate-900">{sentThisWeek}</span> sent ·{" "}
                <span className="font-semibold text-green-600">{repliesThisWeek}</span> replies this week
              </p>
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

      {/* ── Stat orbs + daily allowance ring ──────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {orbs.map((o) => (
          <div key={o.label} className="card card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{o.label}</p>
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon name={o.icon} size={16} />
              </span>
            </div>
            <p className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${o.accent}`}>{o.value}</p>
          </div>
        ))}

        {/* Daily allowance ring */}
        <div className="card p-5">
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
                {Math.round(dailyPct)}%
              </div>
            </div>
            <div className="text-sm">
              <p className="font-semibold tabular-nums">{sentToday} / {dailyLimit}</p>
              <p className="text-xs text-slate-500">{dailyRemaining} left today</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Onboarding vs live campaigns ──────────────────────── */}
      {ctx.user.onboardingStatus !== "COMPLETE" ? (
        <div className="card p-6">
          <h2 className="font-medium">Finish setting up</h2>
          <p className="mt-1 text-sm text-slate-600">
            A short guided setup connects your Gmail, adds your signature, and sends a test email.
          </p>
          <Link href="/onboarding" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
            Continue setup →
          </Link>
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
            { href: "/templates/new", icon: "mail", title: "Build a template", desc: "Design a reusable, personalized email." },
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

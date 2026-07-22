import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getDailyCount, listCampaigns, ownerFromCtx } from "@/lib/repositories/campaigns";
import { currentDayKey } from "@/lib/scheduling/window";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { getOrganization } from "@/lib/repositories/orgSettings";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { Icon, type IconName } from "@/components/ui/Icon";

/** "Good morning" / "Good afternoon" / "Good evening" in the user's timezone. */
function greetingFor(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(
      new Date()
    )
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const [connection, campaigns, sentToday, profile, org] = await Promise.all([
    getConnectionPublic(ctx.userId),
    listCampaigns(owner, 100),
    getDailyCount(owner, currentDayKey(ctx.user.timezone)),
    getSenderProfile(ctx),
    getOrganization(ctx.organizationId),
  ]);

  const gmailConnected = connection?.status === "CONNECTED";
  const active = campaigns.filter((c) => c.status === "ACTIVE");
  const totalReplies = campaigns.reduce((n, c) => n + c.replyCount, 0);
  const dailyRemaining = Math.max(0, profile.sendingDefaults.dailySendLimit - sentToday);
  const recent = campaigns.slice(0, 5);

  const stats: Array<{ label: string; value: number; icon: IconName; tone: string }> = [
    { label: "Emails sent today", value: sentToday, icon: "mail", tone: "text-slate-900" },
    { label: "Daily allowance left", value: dailyRemaining, icon: "hourglass", tone: "text-slate-900" },
    { label: "Active campaigns", value: active.length, icon: "rocket", tone: "text-slate-900" },
    { label: "Replies received", value: totalReplies, icon: "reply", tone: "text-green-600" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greetingFor(ctx.user.timezone)}, {ctx.user.displayName.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org?.name ? `${org.name} workspace · ` : ""}Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary px-5 py-2.5 text-sm">
          + Create campaign
        </Link>
      </div>

      {/* Gmail connection banner */}
      <div
        className={`card mt-6 flex flex-wrap items-center justify-between gap-3 p-4 ${
          gmailConnected ? "" : "ring-1 ring-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              gmailConnected ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            <Icon name={gmailConnected ? "check" : "alert"} size={18} />
          </span>
          <div>
            <p className="text-sm font-medium">
              {gmailConnected ? "Gmail connected" : "Gmail not connected"}
            </p>
            <p className="text-xs text-slate-500">
              {gmailConnected ? connection?.connectedEmail : "Connect it to start sending."}
            </p>
          </div>
        </div>
        {!gmailConnected && (
          <Link href="/settings" className="btn-primary px-4 py-2 text-sm">
            Connect Gmail
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card card-hover overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{s.label}</p>
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"
              >
                <Icon name={s.icon} size={18} />
              </span>
            </div>
            <p className={`mt-3 text-3xl font-semibold tracking-tight ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Setup checklist or quick actions */}
      {ctx.user.onboardingStatus !== "COMPLETE" ? (
        <div className="card mt-6 p-6">
          <h2 className="font-medium">Finish setting up</h2>
          <p className="mt-1 text-sm text-slate-600">
            A short guided setup connects your Gmail, adds your signature, and sends you a
            test email.
          </p>
          <Link href="/onboarding" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
            Continue setup →
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { href: "/campaigns/new", icon: "rocket", title: "Create a campaign", desc: "Pick leads, an email, and a schedule." },
            { href: "/replies", icon: "check", title: "See who replied", desc: "Every reply across your campaigns, in one inbox." },
            { href: "/leads", icon: "users", title: "Import leads", desc: "Paste from Salesforce or upload a CSV." },
            { href: "/templates/new", icon: "mail", title: "Build a template", desc: "Design a reusable, personalized email." },
          ] as Array<{ href: string; icon: IconName; title: string; desc: string }>).map((a) => (
            <Link key={a.href} href={a.href} className="card card-hover group p-5">
              <span
                aria-hidden
                className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
              >
                <Icon name={a.icon} size={22} />
              </span>
              <p className="mt-3 font-semibold group-hover:text-primary">{a.title}</p>
              <p className="mt-1 text-sm text-slate-500">{a.desc}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Recent campaigns */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent campaigns</h2>
          {campaigns.length > 0 && (
            <Link href="/campaigns" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="card p-8 text-center">
            <span className="brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md">
              <Icon name="rocket" size={24} />
            </span>
            <p className="mt-3 text-sm text-slate-600">No campaigns yet.</p>
            <Link href="/campaigns/new" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {recent.map((c) => {
              const badge = CAMPAIGN_STATUS_LABELS[c.status];
              return (
                <Link
                  key={c.campaignId}
                  href={`/campaigns/${c.campaignId}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.sentCount + c.followupSentCount} sent · {c.replyCount} replies
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

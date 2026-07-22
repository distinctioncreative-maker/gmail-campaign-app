import { requireUser } from "@/lib/auth/requireUser";
import { checkDomainAuth } from "@/lib/deliverability/dnsLookup";
import { getPostmasterStats } from "@/lib/deliverability/postmaster";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPercent } from "@/lib/analytics/metrics";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  PASS: "bg-green-100 text-green-700",
  WARN: "bg-amber-100 text-amber-700",
  FAIL: "bg-red-100 text-red-700",
};
const STATUS_WORD: Record<string, string> = { PASS: "Good", WARN: "Check", FAIL: "Fix" };

const REPUTATION_PILL: Record<string, string> = {
  HIGH: "bg-green-100 text-green-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-red-100 text-red-700",
  BAD: "bg-red-100 text-red-700",
};

function spamPct(ratio: number | null): string {
  return ratio === null ? "—" : formatPercent(ratio * 100);
}

export default async function DeliverabilityPage() {
  const ctx = await requireUser();
  const domain = ctx.email.split("@")[1] ?? "";

  const [dnsChecks, postmaster] = await Promise.all([
    checkDomainAuth(domain),
    getPostmasterStats(ctx.userId, domain),
  ]);

  return (
    <div>
      <PageHeader
        title="Deliverability"
        description={`Is ${domain} set up to land in inboxes? Domain authentication is checked live; reputation comes from Google Postmaster Tools.`}
      />

      {/* DNS auth — zero setup, always available */}
      <h2 className="mb-3 font-medium">Domain authentication</h2>
      <div className="card divide-y divide-border overflow-hidden">
        {dnsChecks.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start gap-3 p-4">
            <span className={`badge mt-0.5 ${STATUS_PILL[c.status]}`}>{STATUS_WORD[c.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.label}</p>
              <p className="mt-0.5 text-sm text-slate-600">{c.detail}</p>
              {c.fix && <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">How to fix: {c.fix}</p>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        These three records tell inbox providers your email is genuinely from {domain}. All-green
        here removes the most common structural cause of spam foldering.
      </p>

      {/* Postmaster */}
      <h2 className="mt-10 mb-3 font-medium">Google Postmaster Tools</h2>
      {postmaster.state === "OK" ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm text-slate-500">Domain reputation</p>
              <p className="mt-1">
                <span className={`badge text-sm ${REPUTATION_PILL[postmaster.latestReputation ?? ""] ?? "bg-slate-100 text-slate-600"}`}>
                  {postmaster.latestReputation ?? "Unknown"}
                </span>
              </p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-500">Latest spam rate</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {spamPct(postmaster.days[0]?.spamRatio ?? null)}
              </p>
              <p className="mt-1 text-xs text-slate-400">Keep under 0.1%. 0.3%+ is the danger zone.</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-500">Days with data (30d)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{postmaster.days.length}</p>
            </div>
          </div>
          <div className="overflow-x-auto card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Spam rate</th>
                  <th className="px-4 py-3">Reputation</th>
                  <th className="px-4 py-3">SPF pass</th>
                  <th className="px-4 py-3">DKIM pass</th>
                  <th className="px-4 py-3">DMARC pass</th>
                </tr>
              </thead>
              <tbody>
                {postmaster.days.map((d) => (
                  <tr key={d.date} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 tabular-nums">{d.date}</td>
                    <td className="px-4 py-3 tabular-nums">{spamPct(d.spamRatio)}</td>
                    <td className="px-4 py-3">
                      {d.domainReputation ? (
                        <span className={`badge ${REPUTATION_PILL[d.domainReputation] ?? "bg-slate-100 text-slate-600"}`}>
                          {d.domainReputation}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{spamPct(d.spfSuccess)}</td>
                    <td className="px-4 py-3 tabular-nums">{spamPct(d.dkimSuccess)}</td>
                    <td className="px-4 py-3 tabular-nums">{spamPct(d.dmarcSuccess)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Google only publishes daily stats when enough of your mail reached Gmail inboxes that
            day — gaps are normal for lower volumes.
          </p>
        </>
      ) : (
        <div className="card p-6">
          {postmaster.state === "NOT_CONNECTED" && (
            <p className="text-sm text-slate-600">
              Connect Gmail in <span className="font-medium">Settings</span> first — Postmaster data
              is read with your Google sign-in.
            </p>
          )}
          {postmaster.state === "NEEDS_RECONNECT" && (
            <>
              <p className="font-medium">One-time step: reconnect Gmail</p>
              <p className="mt-1 text-sm text-slate-600">
                Your Gmail was connected before Postmaster access was added. Go to{" "}
                <span className="font-medium">Settings → Reconnect Gmail</span> and approve the
                Google screen once — then this page fills in automatically.
              </p>
            </>
          )}
          {postmaster.state === "NOT_REGISTERED" && (
            <>
              <p className="font-medium">Register {domain} with Google Postmaster (free, one time)</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  A Google Workspace admin opens{" "}
                  <a
                    href="https://postmaster.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    postmaster.google.com
                  </a>{" "}
                  with their {domain} account.
                </li>
                <li>Click “+” and add {domain} — since Google already knows your Workspace owns it, verification is usually instant.</li>
                <li>Data starts appearing within a day or two of normal sending. This page then shows it automatically.</li>
              </ol>
            </>
          )}
          {postmaster.state === "NO_DATA" && (
            <>
              <p className="font-medium">{domain} is registered — no published data yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Google only publishes stats for days with meaningful Gmail volume. Keep sending at a
                steady daily pace and data will appear here. Meanwhile the domain-authentication
                checks above are the best signal.
              </p>
            </>
          )}
        </div>
      )}

      <div className="card mt-8 p-5">
        <h3 className="font-medium">If replies are low, work this list in order</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Fix anything red or amber above — authentication is the foundation.</li>
          <li>Keep volume boring: 50–100 emails per rep per day, spread out. Big one-day spikes look like spam.</li>
          <li>Run the spam checker on your template (Templates → your template) and cut risky wording.</li>
          <li>Personalize the first line — identical bodies to hundreds of people is the pattern filters hunt for.</li>
          <li>Expect replies on days 2–5, not day 1. A 1–5% reply rate is normal for cold outreach.</li>
        </ol>
      </div>
    </div>
  );
}

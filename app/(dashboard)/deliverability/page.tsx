import { requireUser } from "@/lib/auth/requireUser";
import { checkDomainAuth } from "@/lib/deliverability/dnsLookup";
import { getPostmasterStats } from "@/lib/deliverability/postmaster";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPercent } from "@/lib/analytics/metrics";
import { getBenchmarksSnapshot } from "@/lib/benchmarks/read";
import { bucketBatchSize, bucketDailyLimit, type DimensionAggregate } from "@/lib/benchmarks/buckets";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid } from "@/components/ui/StatTile";

/** Which bucket the signed-in user's OWN current default falls into, for
 * dimensions we can compare against a live setting (pacing only: content
 * dimensions like image/link count are per-template, not a standing default). */
const OWN_SETTING_BUCKET: Partial<Record<string, (n: number) => string>> = {
  emailsPerBatch: bucketBatchSize,
  dailySendLimit: bucketDailyLimit,
};

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  PASS: "bg-success-soft text-success",
  WARN: "bg-warning-soft text-warning",
  FAIL: "bg-danger-soft text-danger",
};
const STATUS_WORD: Record<string, string> = { PASS: "Good", WARN: "Check", FAIL: "Fix" };

const REPUTATION_PILL: Record<string, string> = {
  HIGH: "bg-success-soft text-success",
  MEDIUM: "bg-warning-soft text-warning",
  LOW: "bg-danger-soft text-danger",
  BAD: "bg-danger-soft text-danger",
};

function spamPct(ratio: number | null): string {
  return ratio === null ? "Not available" : formatPercent(ratio * 100);
}

export default async function DeliverabilityPage() {
  const ctx = await requireUser();
  const domain = ctx.email.split("@")[1] ?? "";

  const [dnsChecks, postmaster, benchmarks, profile] = await Promise.all([
    checkDomainAuth(domain),
    getPostmasterStats(ctx.userId, domain),
    getBenchmarksSnapshot(),
    getSenderProfile(ctx),
  ]);
  const ownValueFor: Record<string, number> = {
    emailsPerBatch: profile.sendingDefaults.emailsPerBatch,
    dailySendLimit: profile.sendingDefaults.dailySendLimit,
  };
  const surfacedDimensions = (benchmarks?.dimensions ?? []).filter((d) => d.buckets.length > 0);

  return (
    <div>
      <PageHeader
        title="Deliverability"
        description={`Is ${domain} set up to land in inboxes? Domain authentication is checked live; reputation comes from Google Postmaster Tools.`}
      />

      {/* DNS auth: zero setup, always available */}
      <h2 className="mb-3 font-medium">Domain authentication</h2>
      <div className="card divide-y divide-border overflow-hidden">
        {dnsChecks.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start gap-3 p-4">
            <span className={`badge mt-0.5 ${STATUS_PILL[c.status]}`}>{STATUS_WORD[c.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.label}</p>
              <p className="mt-0.5 text-sm text-muted">{c.detail}</p>
              {c.fix && <p className="mt-1.5 rounded-lg bg-surface-2 p-2 text-xs text-muted">How to fix: {c.fix}</p>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        These three records tell inbox providers your email is genuinely from {domain}. All-green
        here removes the most common structural cause of spam foldering.
      </p>

      {/* Postmaster */}
      <h2 className="mt-10 mb-3 font-medium">Google Postmaster Tools</h2>
      {postmaster.state === "OK" ? (
        <>
          <div className="mb-4">
            <StatGrid columns={3}>
              <StatTile
                label="Domain reputation"
                icon="shield"
                tone={postmaster.latestReputation === "HIGH" ? "success" : "default"}
                value={
                  <span className={`badge text-sm ${REPUTATION_PILL[postmaster.latestReputation ?? ""] ?? "bg-surface-2 text-muted"}`}>
                    {postmaster.latestReputation ?? "Unknown"}
                  </span>
                }
                hint="How Gmail rates mail from your domain"
              />
              <StatTile
                label="Latest spam rate"
                icon="alert"
                size="sm"
                tone={
                  postmaster.days[0]?.spamRatio != null && postmaster.days[0].spamRatio >= 0.003
                    ? "danger"
                    : "default"
                }
                value={
                  postmaster.days[0]?.spamRatio != null ? (
                    <CountUp value={postmaster.days[0].spamRatio * 100} decimals={1} suffix="%" />
                  ) : (
                    <span className="text-xl text-muted">Not available</span>
                  )
                }
                hint="Keep under 0.1%. 0.3% and above is the danger zone."
              />
              <StatTile
                label="Days with data (30d)"
                icon="chart"
                size="sm"
                value={<CountUp value={postmaster.days.length} />}
                hint="Postmaster only reports days with enough volume"
              />
            </StatGrid>
          </div>
          <div className="overflow-x-auto card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
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
                  <tr key={d.date} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 tabular-nums">{d.date}</td>
                    <td className="px-4 py-3 tabular-nums">{spamPct(d.spamRatio)}</td>
                    <td className="px-4 py-3">
                      {d.domainReputation ? (
                        <span className={`badge ${REPUTATION_PILL[d.domainReputation] ?? "bg-surface-2 text-muted"}`}>
                          {d.domainReputation}
                        </span>
                      ) : (
                        "Not available"
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
          <p className="mt-2 text-xs text-muted">
            Google only publishes daily stats when enough of your mail reached Gmail inboxes that
            day: gaps are normal for lower volumes.
          </p>
        </>
      ) : (
        <div className="card p-6">
          {postmaster.state === "NOT_CONNECTED" && (
            <p className="text-sm text-muted">
              Connect Gmail in <span className="font-medium">Settings</span> first: Postmaster data
              is read with your Google sign-in.
            </p>
          )}
          {postmaster.state === "NEEDS_RECONNECT" && (
            <>
              <p className="font-medium">One-time step: reconnect Gmail</p>
              <p className="mt-1 text-sm text-muted">
                Your Gmail was connected before Postmaster access was added. Go to{" "}
                <span className="font-medium">Settings → Reconnect Gmail</span> and approve the
                Google screen once: then this page fills in automatically.
              </p>
            </>
          )}
          {postmaster.state === "NOT_REGISTERED" && (
            <>
              <p className="font-medium">Register {domain} with Google Postmaster (free, one time)</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
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
                <li>Click “+” and add {domain}: since Google already knows your Workspace owns it, verification is usually instant.</li>
                <li>Data starts appearing within a day or two of normal sending. This page then shows it automatically.</li>
              </ol>
            </>
          )}
          {postmaster.state === "NO_DATA" && (
            <>
              <p className="font-medium">{domain} is registered: no published data yet</p>
              <p className="mt-1 text-sm text-muted">
                Google only publishes stats for days with meaningful Gmail volume. Keep sending at a
                steady daily pace and data will appear here. Meanwhile the domain-authentication
                checks above are the best signal.
              </p>
            </>
          )}
        </div>
      )}

      {/* Deliverability Insights: anonymized, cross-user benchmarks */}
      <h2 className="mt-10 mb-3 font-medium">Deliverability insights</h2>
      {surfacedDimensions.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          <p className="font-medium text-foreground">Still gathering data</p>
          <p className="mt-1">
            This learns what actually drives deliverability, reply rate, and click rate, across every
            Cadence campaign, fully anonymized: a setting only shows up here once enough campaigns
            have used it that no single campaign could be identified. Check back soon.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">
            From {benchmarks?.totalCampaignsConsidered ?? 0} anonymized campaigns across every Cadence
            user: nothing here is traceable to one account, and a setting only appears once enough
            campaigns share it.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {surfacedDimensions.map((d) => (
              <DimensionCard key={d.dimension} dimension={d} ownBucket={
                OWN_SETTING_BUCKET[d.dimension] && ownValueFor[d.dimension] !== undefined
                  ? OWN_SETTING_BUCKET[d.dimension]!(ownValueFor[d.dimension])
                  : null
              } />
            ))}
          </div>
        </>
      )}

      <div className="card mt-8 p-5">
        <h3 className="font-medium">If replies are low, work this list in order</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Fix anything red or amber above: authentication is the foundation.</li>
          <li>{dailyLimitTip(surfacedDimensions)}</li>
          <li>Run the spam checker on your template (Templates → your template) and cut risky wording.</li>
          <li>Personalize the first line: identical bodies to hundreds of people is the pattern filters hunt for.</li>
          <li>Replies often arrive after the first day. Compare qualified-reply trends within your own audience and offer instead of treating one broad benchmark as a promise.</li>
        </ol>
      </div>
    </div>
  );
}

/** Tip #2 cites the actual best-performing daily-limit bucket once real,
 * anonymized data backs it: falls back to the general guidance until then. */
function dailyLimitTip(dimensions: DimensionAggregate[]): string {
  const dim = dimensions.find((d) => d.dimension === "dailySendLimit");
  const best = dim?.buckets[0];
  if (!best) {
    return "Keep volume steady and account-specific. Start conservatively, spread sends through the working window, and avoid sudden one-day spikes.";
  }
  return `Keep volume boring: across ${best.campaigns} anonymized campaigns, ${best.bucket}/day gets the best reply rate (${formatPercent(best.avgReplyRate)}). Big one-day spikes look like spam.`;
}

function DimensionCard({
  dimension,
  ownBucket,
}: {
  dimension: DimensionAggregate;
  ownBucket: string | null;
}) {
  const best = dimension.buckets[0];
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{dimension.label}</p>
      <p className="mt-1 text-lg font-semibold">{best.bucket}</p>
      <p className="mt-1 text-xs text-muted">
        {formatPercent(best.avgReplyRate)} reply rate · {formatPercent(best.avgBounceRate)} bounce rate
        {best.avgOpenRate !== null && ` · ${formatPercent(best.avgOpenRate)} open rate`}
      </p>
      <p className="mt-1 text-[11px] text-muted">Best of {dimension.buckets.length} groups · {best.campaigns} campaigns</p>
      {ownBucket !== null && (
        <p className={`mt-2 text-xs font-medium ${ownBucket === best.bucket ? "text-success" : "text-warning"}`}>
          {ownBucket === best.bucket ? "✓ Your default matches this" : `Your default: ${ownBucket}`}
        </p>
      )}
    </div>
  );
}

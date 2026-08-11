import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { LocalTime } from "@/components/LocalTime";
import { DEMO_REPLIES } from "@/lib/demo/fixtures";
import { formatDealValue } from "@/lib/campaigns/outcomes";

/** The tour shows outcomes as static chips rather than the live control: the
 * point here is to demonstrate that the loop closes, not to invite a
 * signed-out visitor to write to a workspace that does not exist. */
const OUTCOME: Record<string, { label: string; className: string }> = {
  MEETING_BOOKED: { label: "Meeting booked", className: "bg-primary-soft text-primary" },
  WON: { label: "Won", className: "bg-success-soft text-success" },
  LOST: { label: "Lost", className: "bg-surface-2 text-muted" },
};

const INTENT: Record<string, { label: string; className: string }> = {
  INTERESTED: { label: "Interested", className: "bg-success-soft text-success" },
  REPLIED: { label: "Needs reply", className: "bg-info-soft text-info" },
  NOT_INTERESTED: { label: "Not interested", className: "bg-surface-2 text-muted" },
};

export default function DemoRepliesPage() {
  const interested = DEMO_REPLIES.filter((r) => r.intent === "INTERESTED").length;
  const won = DEMO_REPLIES.filter((r) => r.dealStatus === "WON");
  const wonValueCents = won.reduce((sum, r) => sum + (r.dealValueCents ?? 0), 0);
  const awaiting = DEMO_REPLIES.filter(
    (r) => r.dealStatus === null && r.intent !== "NOT_INTERESTED"
  ).length;

  return (
    <div>
      <PageHeader
        title="Replies"
        description="Everyone who replied, ranked so the interested ones are on top."
      />

      <StatGrid columns={3}>
        <StatTile label="Interested" value={String(interested)} icon="sparkles" tone="revenue" size="sm" hint="Work these first" />
        <StatTile label="Total replies" value={String(DEMO_REPLIES.length)} icon="reply" size="sm" hint="Across every campaign" />
        <StatTile label="This week" value="3" icon="clock" tone="success" size="sm" hint="Landed in the last 7 days" />
        <StatTile label="Median time to reply" value="6h 20m" icon="hourglass" size="sm" hint="How fast your list responds" />
        <StatTile
          label="Won"
          value={String(won.length)}
          icon="check"
          tone="revenue"
          size="sm"
          hint={`${formatDealValue(wonValueCents)} recorded`}
        />
        <StatTile
          label="Waiting on you"
          value={String(awaiting)}
          icon="alert"
          tone={awaiting > 0 ? "warning" : "default"}
          size="sm"
          hint="Replies with no outcome yet"
        />
      </StatGrid>

      <ul className="mt-8 space-y-2">
        {DEMO_REPLIES.map((r) => {
          const chip = INTENT[r.intent];
          return (
            <li key={r.email} className="card p-5 sm:p-6 card-hover">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.name} <span className="font-normal text-muted">{r.email}</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">{r.snippet}</p>
                  <p className="mt-2 text-xs text-muted">
                    {r.campaign} · <LocalTime value={r.repliedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {r.dealStatus && (
                    <span className={`badge ${OUTCOME[r.dealStatus].className}`}>
                      {OUTCOME[r.dealStatus].label}
                      {r.dealValueCents !== null && ` · ${formatDealValue(r.dealValueCents)}`}
                    </span>
                  )}
                  <span className={`badge ${chip.className}`}>{chip.label}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

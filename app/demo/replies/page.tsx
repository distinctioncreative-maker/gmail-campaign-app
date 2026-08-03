import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { LocalTime } from "@/components/LocalTime";
import { DEMO_REPLIES } from "@/lib/demo/fixtures";

const INTENT: Record<string, { label: string; className: string }> = {
  INTERESTED: { label: "Interested", className: "bg-success-soft text-success" },
  REPLIED: { label: "Needs reply", className: "bg-info-soft text-info" },
  NOT_INTERESTED: { label: "Not interested", className: "bg-surface-2 text-muted" },
};

export default function DemoRepliesPage() {
  const interested = DEMO_REPLIES.filter((r) => r.intent === "INTERESTED").length;

  return (
    <div>
      <PageHeader
        title="Replies"
        description="Everyone who replied, ranked so the interested ones are on top."
      />

      <StatGrid columns={4}>
        <StatTile label="Interested" value={String(interested)} icon="sparkles" tone="revenue" size="sm" hint="Work these first" />
        <StatTile label="Total replies" value={String(DEMO_REPLIES.length)} icon="reply" size="sm" hint="Across every campaign" />
        <StatTile label="This week" value="3" icon="clock" tone="success" size="sm" hint="Landed in the last 7 days" />
        <StatTile label="Median time to reply" value="6h 20m" icon="hourglass" size="sm" hint="How fast your list responds" />
      </StatGrid>

      <ul className="mt-8 space-y-2">
        {DEMO_REPLIES.map((r) => {
          const chip = INTENT[r.intent];
          return (
            <li key={r.email} className="card card-hover p-4">
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
                <span className={`badge shrink-0 ${chip.className}`}>{chip.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

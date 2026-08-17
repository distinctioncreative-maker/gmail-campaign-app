/* Lightweight, dependency-free charts for the analytics dashboard. Pure SVG/CSS
   driven by pre-aggregated data. The trend panel delegates to the shared chart
   primitives; the heatmap and hour table stay local because their forms are
   specific to this page. */

import { TrendChart as ChartTrend } from "@/components/ui/charts/TrendChart";
import { Meter } from "@/components/ui/charts/Meter";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 7×24 reply heatmap: when (local day × hour) prospects reply. */
export function ReplyHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="text-sm text-muted">No replies in this period yet. The heatmap fills in as people reply.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div className="w-9" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[13px] text-center text-[8px] text-muted">
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center">
            <div className="w-9 pr-1 text-right text-[10px] text-muted">{WEEKDAYS[d]}</div>
            {row.map((count, h) => {
              const intensity = count / max;
              return (
                <div
                  key={h}
                  title={`${WEEKDAYS[d]} ${h}:00, ${count} repl${count === 1 ? "y" : "ies"}`}
                  className="m-[1px] h-3 w-3 rounded-[3px]"
                  style={{
                    background:
                      count === 0
                        ? "var(--surface-2)"
                        : `color-mix(in srgb, var(--primary) ${18 + intensity * 82}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* The Catmull-Rom smoothPath that used to live here, and the chart geometry
   constants beside it, are gone. That spline is the one this codebase's own
   tests now demonstrate undershoots: on [4, 4, 90, 4, 4] it drew -2.37 against a
   data floor of 4. components/ui/charts/geometry.ts uses Fritsch-Carlson
   monotone interpolation instead, which cannot leave the interval between two
   points it connects. */

/**
 * Sends and replies over the period, drawn as small multiples.
 *
 * This previously plotted both series on one chart with **two different y
 * scales**: `maxSent` for the blue line and `maxReplied` for the green one.
 * The comment explaining it was candid about the motivation: on a shared axis
 * the reply line flattened into the baseline and the chart looked useless. That
 * diagnosis was right and the fix was the single most misleading thing a chart
 * can do.
 *
 * With 445 sends and 2 replies in a week, `maxSent` is 445 and `maxReplied` is
 * 2, so a day with one reply was drawn at exactly the same height as a day with
 * 222 sends. The chart implied a reply rate near 100%. Worse, the gridlines were
 * labelled against the send scale alone, so the green line carried no axis at
 * all and a reader had no way to discover the trick.
 *
 * Two measures of genuinely different magnitude get two charts. Each has its own
 * honest zero baseline, they share an x-axis, and stacking them answers the same
 * question the dual axis was reaching for (is the effort turning into
 * conversations?) without inviting a comparison of heights that means nothing.
 */
export function TrendChart({ rows }: { rows: Array<{ day: string; sent: number; replied: number }> }) {
  const totalSent = rows.reduce((a, r) => a + r.sent, 0);
  const totalReplied = rows.reduce((a, r) => a + r.replied, 0);
  if (totalSent === 0) {
    return <p className="text-sm text-muted">No sends in this period yet.</p>;
  }

  const labels = rows.map((r) => r.day.slice(5));

  return (
    <div className="space-y-5">
      <div>
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Emails sent</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {totalSent.toLocaleString()}
          </span>
        </p>
        <ChartTrend
          series={[{ name: "Emails sent", values: rows.map((r) => r.sent), tone: 1 }]}
          labels={labels}
          height={150}
          caption={`Emails sent per day. ${totalSent} over ${rows.length} days.`}
        />
      </div>
      <div>
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Replies</span>
          <span className="text-sm font-semibold tabular-nums text-revenue">
            {totalReplied.toLocaleString()}
          </span>
        </p>
        <ChartTrend
          series={[{ name: "Replies", values: rows.map((r) => r.replied), tone: 2 }]}
          labels={labels}
          height={150}
          caption={`Replies per day. ${totalReplied} over ${rows.length} days.`}
        />
      </div>
    </div>
  );
}

/** Reply rate by send hour: which hours produced the most replies. */
export function BestSendTimes({
  rows,
}: {
  rows: Array<{ hour: number; sent: number; replied: number; rate: number }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Send some emails to see which hours reply best.</p>;
  }
  const maxRate = Math.max(1, ...rows.map((r) => r.rate));
  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.hour} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 text-right text-muted">{fmtHour(r.hour)}</span>
          <Meter value={r.rate} max={maxRate} height={12} className="flex-1" />
          <span className="w-24 shrink-0 tabular-nums text-muted">
            {r.rate.toFixed(0)}% · {r.replied}/{r.sent}
          </span>
        </div>
      ))}
    </div>
  );
}

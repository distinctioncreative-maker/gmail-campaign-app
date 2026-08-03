/* Lightweight, dependency-free charts (server components) for the analytics
   dashboard. Pure SVG/CSS driven by pre-aggregated data. */

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

/** Catmull-Rom to cubic Bezier: a smooth path through every point, no library. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const CHART_W = 720;
const CHART_H = 200;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 22;

/**
 * The hero chart of the Reports page: volume as a filled area, replies as a
 * bold line on top, so the question a customer actually asks (is the effort
 * turning into conversations?) is answered by the shape alone.
 *
 * Replies are plotted on their own scale. Sharing an axis with send volume
 * flattened the reply line into the baseline and made the chart useless,
 * which is why the previous version showed a 3px bar strip instead.
 */
export function TrendChart({ rows }: { rows: Array<{ day: string; sent: number; replied: number }> }) {
  const totalSent = rows.reduce((a, r) => a + r.sent, 0);
  const totalReplied = rows.reduce((a, r) => a + r.replied, 0);
  if (totalSent === 0) {
    return <p className="text-sm text-muted">No sends in this period yet.</p>;
  }

  const maxSent = Math.max(1, ...rows.map((r) => r.sent));
  const maxReplied = Math.max(1, ...rows.map((r) => r.replied));
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;
  const xAt = (i: number) => PAD_L + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const yAt = (v: number, max: number) => PAD_T + innerH - (v / max) * innerH;

  const sentPoints = rows.map((r, i) => ({ x: xAt(i), y: yAt(r.sent, maxSent) }));
  const replyPoints = rows.map((r, i) => ({ x: xAt(i), y: yAt(r.replied, maxReplied) }));
  const sentLine = smoothPath(sentPoints);
  const sentArea = `${sentLine} L ${xAt(rows.length - 1)} ${PAD_T + innerH} L ${PAD_L} ${PAD_T + innerH} Z`;

  // Label the ends and the midpoint only: a tick per day is unreadable at 90d.
  const tickIdx = rows.length <= 2 ? rows.map((_, i) => i) : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
          Emails sent
          <span className="font-medium tabular-nums text-foreground">{totalSent.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-2 w-2 rounded-full bg-revenue" />
          Replies
          <span className="font-medium tabular-nums text-foreground">{totalReplied.toLocaleString()}</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label={`Daily sends and replies. ${totalSent} sent and ${totalReplied} replies over ${rows.length} days.`}
      >
        <defs>
          <linearGradient id="trend-sent-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines, labelled against the send scale. */}
        {[0, 0.5, 1].map((f) => {
          const y = PAD_T + innerH - f * innerH;
          return (
            <g key={f}>
              <line
                x1={PAD_L}
                x2={CHART_W - PAD_R}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray={f === 0 ? undefined : "3 4"}
              />
              <text x={PAD_L - 7} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
                {Math.round(maxSent * f).toLocaleString()}
              </text>
            </g>
          );
        })}

        <path d={sentArea} fill="url(#trend-sent-fill)" />
        <path
          d={sentLine}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={smoothPath(replyPoints)}
          fill="none"
          stroke="var(--revenue)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Reply markers, so a single good day is still visible on a long range. */}
        {rows.map((r, i) =>
          r.replied > 0 ? (
            <circle
              key={r.day}
              cx={replyPoints[i].x}
              cy={replyPoints[i].y}
              r="2.75"
              fill="var(--surface)"
              stroke="var(--revenue)"
              strokeWidth="1.75"
            >
              <title>{`${r.day}: ${r.sent} sent, ${r.replied} repl${r.replied === 1 ? "y" : "ies"}`}</title>
            </circle>
          ) : null
        )}

        {tickIdx.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={CHART_H - 5}
            textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}
            fontSize="10"
            fill="var(--muted)"
          >
            {rows[i].day.slice(5)}
          </text>
        ))}
      </svg>
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
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-surface-2" style={{ width: `${(r.rate / maxRate) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 tabular-nums text-muted">
            {r.rate.toFixed(0)}% · {r.replied}/{r.sent}
          </span>
        </div>
      ))}
    </div>
  );
}

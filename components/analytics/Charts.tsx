/* Lightweight, dependency-free charts (server components) for the analytics
   dashboard. Pure SVG/CSS driven by pre-aggregated data. */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 7×24 reply heatmap: when (local day × hour) prospects reply. */
export function ReplyHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="text-sm text-slate-400">No replies yet — the heatmap fills in as people reply.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div className="w-9" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[13px] text-center text-[8px] text-slate-400">
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center">
            <div className="w-9 pr-1 text-right text-[10px] text-slate-400">{WEEKDAYS[d]}</div>
            {row.map((count, h) => {
              const intensity = count / max;
              return (
                <div
                  key={h}
                  title={`${WEEKDAYS[d]} ${h}:00 — ${count} repl${count === 1 ? "y" : "ies"}`}
                  className="m-[1px] h-3 w-3 rounded-[3px]"
                  style={{
                    background:
                      count === 0
                        ? "var(--surface-2, #f1f5f9)"
                        : `rgba(79,70,229,${0.18 + intensity * 0.82})`,
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

/** Sent vs replies per day. Sent = light bar, replies = accent overlay. */
export function TrendChart({ rows }: { rows: Array<{ day: string; sent: number; replied: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.sent));
  const totalSent = rows.reduce((a, r) => a + r.sent, 0);
  if (totalSent === 0) {
    return <p className="text-sm text-slate-400">No sends in the last 30 days yet.</p>;
  }
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {rows.map((r) => (
        <div
          key={r.day}
          className="group relative flex flex-1 flex-col justify-end"
          title={`${r.day}: ${r.sent} sent · ${r.replied} replies`}
        >
          <div className="relative w-full rounded-t bg-slate-100" style={{ height: `${(r.sent / max) * 100}%` }}>
            <div
              className="absolute bottom-0 w-full rounded-t bg-green-500"
              style={{ height: `${r.sent > 0 ? (r.replied / r.sent) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Reply rate by send hour — which hours produced the most replies. */
export function BestSendTimes({
  rows,
}: {
  rows: Array<{ hour: number; sent: number; replied: number; rate: number }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Send some emails to see which hours reply best.</p>;
  }
  const maxRate = Math.max(1, ...rows.map((r) => r.rate));
  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.hour} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 text-right text-slate-400">{fmtHour(r.hour)}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full brand-gradient" style={{ width: `${(r.rate / maxRate) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 tabular-nums text-slate-500">
            {r.rate.toFixed(0)}% · {r.replied}/{r.sent}
          </span>
        </div>
      ))}
    </div>
  );
}

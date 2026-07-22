"use client";

import { useId, useMemo, useState } from "react";

export interface PulseDay {
  day: string; // YYYY-MM-DD
  sent: number;
  replied: number;
}

const W = 720;
const H = 180;
const PAD_X = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

/**
 * A live "activity pulse" — sent volume as a glowing gradient area with an
 * animated draw-in, replies as pulsing markers. Dependency-free SVG, theme-
 * aware (uses the app's --primary), with a scrubber tooltip.
 */
export function PulseChart({ data }: { data: PulseDay[] }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    const n = Math.max(data.length, 1);
    const max = Math.max(1, ...data.map((d) => d.sent));
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_X + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;
    const pts = data.map((d, i) => ({ px: x(i), py: y(d.sent), ry: y(d.replied), ...d }));

    // Smooth Catmull-Rom → cubic bezier path through the sent points.
    const line = (arr: Array<{ px: number; py: number }>) => {
      if (arr.length < 2) return arr.length ? `M ${arr[0].px} ${arr[0].py}` : "";
      let d = `M ${arr[0].px} ${arr[0].py}`;
      for (let i = 0; i < arr.length - 1; i++) {
        const p0 = arr[i === 0 ? 0 : i - 1];
        const p1 = arr[i];
        const p2 = arr[i + 1];
        const p3 = arr[i + 2 < arr.length ? i + 2 : i + 1];
        const c1x = p1.px + (p2.px - p0.px) / 6;
        const c1y = p1.py + (p2.py - p0.py) / 6;
        const c2x = p2.px - (p3.px - p1.px) / 6;
        const c2y = p2.py - (p3.py - p1.py) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.px} ${p2.py}`;
      }
      return d;
    };

    const linePath = line(pts);
    const areaPath =
      pts.length > 0
        ? `${linePath} L ${pts[pts.length - 1].px} ${H - PAD_BOTTOM} L ${pts[0].px} ${H - PAD_BOTTOM} Z`
        : "";
    return { pts, linePath, areaPath, innerH };
  }, [data]);

  const totalSent = data.reduce((a, d) => a + d.sent, 0);
  const totalReplied = data.reduce((a, d) => a + d.replied, 0);
  const last = geom.pts[geom.pts.length - 1];
  const active = hover !== null ? geom.pts[hover] : last;

  if (totalSent === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-slate-400">
        Your activity pulse appears here once campaigns start sending.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Activity: ${totalSent} sent and ${totalReplied} replies over ${data.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${gid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* baseline */}
        <line x1={PAD_X} y1={H - PAD_BOTTOM} x2={W - PAD_X} y2={H - PAD_BOTTOM} stroke="var(--border)" strokeWidth="1" />

        {/* area + line */}
        <path d={geom.areaPath} fill={`url(#area-${gid})`} className="pulse-area" />
        <path
          d={geom.linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#glow-${gid})`}
          className="pulse-line"
        />

        {/* reply markers */}
        {geom.pts.map((p, i) =>
          p.replied > 0 ? (
            <circle key={i} cx={p.px} cy={p.ry} r="3.5" fill="#1a9e5f" className="pulse-dot" style={{ animationDelay: `${i * 90}ms` }} />
          ) : null
        )}

        {/* hover hit areas */}
        {geom.pts.map((p, i) => (
          <rect
            key={`h-${i}`}
            x={p.px - (W - PAD_X * 2) / (2 * Math.max(1, geom.pts.length - 1))}
            y={0}
            width={(W - PAD_X * 2) / Math.max(1, geom.pts.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* active marker */}
        {active && (
          <>
            <line x1={active.px} y1={PAD_TOP - 6} x2={active.px} y2={H - PAD_BOTTOM} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            <circle cx={active.px} cy={active.py} r="7" fill="var(--primary)" opacity="0.18" className="pulse-ring" />
            <circle cx={active.px} cy={active.py} r="4" fill="var(--primary)" />
          </>
        )}
      </svg>

      {/* floating readout */}
      {active && (
        <div className="pointer-events-none absolute left-0 top-0 flex gap-4 px-1 text-xs">
          <span className="tabular-nums text-slate-500">
            <span className="font-semibold text-slate-900">{active.sent}</span> sent
          </span>
          <span className="tabular-nums text-slate-500">
            <span className="font-semibold text-green-600">{active.replied}</span> replies
          </span>
          <span className="text-slate-400">{active.day.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

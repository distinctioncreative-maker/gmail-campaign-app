"use client";

import { useId, useMemo, useState } from "react";

export interface PulseDay {
  day: string; // YYYY-MM-DD
  sent: number;
  replied: number;
}

const W = 720;
const H = 200;
const PAD_X = 10;
const PAD_TOP = 22;
const PAD_BOTTOM = 24;

/** Smooth Catmull-Rom → cubic bezier path through points. */
function smoothPath(arr: Array<{ px: number; py: number }>): string {
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
}

/**
 * Live "activity pulse": glowing gradient area that draws itself in, a bright
 * dot that travels along the line, a shimmer sweep, and pulsing reply markers.
 * When there's no data yet it shows a gently animated sample wave so the
 * dashboard never looks dead. Dependency-free SVG, theme-aware.
 */
export function PulseChart({ data }: { data: PulseDay[] }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const totalSent = data.reduce((a, d) => a + d.sent, 0);
  const isEmpty = totalSent === 0;

  const geom = useMemo(() => {
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;

    // Real data, or a soft sample wave when empty (so it always feels alive).
    const series = isEmpty
      ? Array.from({ length: 14 }, (_, i) => ({
          day: "",
          sent: 6 + Math.sin(i / 1.7) * 4 + Math.sin(i / 0.9) * 1.6 + 5,
          replied: 0,
        }))
      : data;

    const n = Math.max(series.length, 1);
    const max = Math.max(1, ...series.map((d) => d.sent));
    const x = (i: number) => PAD_X + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;
    const pts = series.map((d, i) => ({ px: x(i), py: y(d.sent), ry: y(d.replied), ...d }));

    const linePath = smoothPath(pts);
    const areaPath =
      pts.length > 0
        ? `${linePath} L ${pts[pts.length - 1].px} ${H - PAD_BOTTOM} L ${pts[0].px} ${H - PAD_BOTTOM} Z`
        : "";
    return { pts, linePath, areaPath };
  }, [data, isEmpty]);

  const last = geom.pts[geom.pts.length - 1];
  const active = hover !== null ? geom.pts[hover] : last;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Activity over ${data.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={isEmpty ? "0.18" : "0.38"} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`stroke-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="55%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id={`sheen-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${gid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* faint gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            y1={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f}
            x2={W - PAD_X}
            y2={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        <line x1={PAD_X} y1={H - PAD_BOTTOM} x2={W - PAD_X} y2={H - PAD_BOTTOM} stroke="var(--border)" strokeWidth="1" />

        {/* area + line */}
        <path d={geom.areaPath} fill={`url(#area-${gid})`} className="pulse-area" />
        <path
          id={`line-${gid}`}
          d={geom.linePath}
          fill="none"
          stroke={`url(#stroke-${gid})`}
          strokeWidth="2.75"
          strokeLinecap="round"
          filter={`url(#glow-${gid})`}
          className="pulse-line"
        />
        {/* moving shimmer sweep clipped to the line */}
        <path
          d={geom.linePath}
          fill="none"
          stroke={`url(#sheen-${gid})`}
          strokeWidth="3"
          strokeLinecap="round"
          className="pulse-sheen"
        />

        {/* traveling glow dot along the line */}
        {geom.pts.length > 1 && (
          <circle r="4.5" fill="#fff" opacity="0.95">
            <animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href={`#line-${gid}`} />
            </animateMotion>
            <animate attributeName="opacity" values="0;1;1;0" dur="3.4s" repeatCount="indefinite" />
          </circle>
        )}

        {/* reply markers */}
        {geom.pts.map((p, i) =>
          p.replied > 0 ? (
            <g key={i}>
              <circle cx={p.px} cy={p.ry} r="7" fill="#1a9e5f" opacity="0.18" className="pulse-ring" style={{ animationDelay: `${i * 120}ms` }} />
              <circle cx={p.px} cy={p.ry} r="3.5" fill="#1a9e5f" className="pulse-dot" style={{ animationDelay: `${i * 120}ms` }} />
            </g>
          ) : null
        )}

        {/* hover hit areas + active marker (real data only) */}
        {!isEmpty && (
          <>
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
            {active && (
              <>
                <line x1={active.px} y1={PAD_TOP - 8} x2={active.px} y2={H - PAD_BOTTOM} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                <circle cx={active.px} cy={active.py} r="8" fill="var(--primary)" opacity="0.16" className="pulse-ring" />
                <circle cx={active.px} cy={active.py} r="4.5" fill="var(--primary)" stroke="#fff" strokeWidth="1.5" />
              </>
            )}
          </>
        )}
      </svg>

      {/* floating readout / empty hint */}
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-slate-500 backdrop-blur">
            Your live activity appears here as you send
          </span>
        </div>
      ) : (
        active && (
          <div className="pointer-events-none absolute left-0 top-0 flex gap-4 px-1 text-xs">
            <span className="text-slate-500">
              <span className="font-semibold text-slate-900 tabular-nums">{active.sent}</span> sent
            </span>
            <span className="text-slate-500">
              <span className="font-semibold text-green-600 tabular-nums">{active.replied}</span> replies
            </span>
            <span className="text-slate-400">{active.day.slice(5)}</span>
          </div>
        )
      )}
    </div>
  );
}

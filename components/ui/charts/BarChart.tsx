"use client";

import { useState } from "react";
import { compact, niceTicks, scale } from "./geometry";

export type Bar = { label: string; value: number };

/**
 * Magnitude comparison: sends by hour, replies by template, bounces by domain.
 *
 * The specifics worth keeping:
 *
 * **Bars are capped at 24px and never fill their slot.** Letting a bar expand to
 * the full band width turns the gaps into stripes and the chart into a barcode.
 * The leftover space is air, and it is doing work.
 *
 * **A 4px radius on the data end only, square at the baseline.** Rounding the
 * bottom too would lift the bar off its own axis, which is the one place it must
 * be exact. That is why this draws a path rather than a `<rect rx>`.
 *
 * **A 2px gap in the surface colour between touching bars**, rather than a
 * stroke. A stroke adds ink that is not data; a gap separates with nothing.
 *
 * **Zero baseline, always.** A bar chart encodes magnitude by length, so a
 * truncated axis is not a stylistic choice, it is a false statement about ratio.
 */
export function BarChart({
  data,
  height = 200,
  tone = 1,
  format = (value: number) => value.toLocaleString(),
  caption,
}: {
  data: Bar[];
  height?: number;
  tone?: 1 | 2;
  format?: (value: number) => string;
  caption?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (data.length === 0) return null;

  const width = 720;
  const padding = { top: 14, right: 8, bottom: 26, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(0, rawMax || 1, 3);
  const max = Math.max(...ticks, rawMax || 1);

  const band = plotWidth / data.length;
  // Cap, then subtract the 2px surface gap so neighbours never touch.
  const barWidth = Math.max(4, Math.min(24, band - 8) - 2);
  const radius = 4;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={caption ?? `${data.length} values compared`}
          onMouseLeave={() => setActive(null)}
          className="block"
        >
          <g transform={`translate(${padding.left},${padding.top})`}>
            {ticks.map((tick) => {
              const y = scale(tick, 0, max, plotHeight, 0);
              return (
                <g key={tick}>
                  <line x1="0" y1={y} x2={plotWidth} y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
                  <text
                    x="-10"
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted text-2xs tabular-nums"
                  >
                    {compact(tick)}
                  </text>
                </g>
              );
            })}

            {data.map((item, index) => {
              const barHeight = Math.max(0, plotHeight - scale(item.value, 0, max, plotHeight, 0));
              const x = index * band + (band - barWidth) / 2;
              const y = plotHeight - barHeight;
              const r = Math.min(radius, barHeight);
              // Rounded at the top, square where it meets the axis.
              const d =
                barHeight <= 0
                  ? ""
                  : `M ${x} ${plotHeight} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + barWidth - r} ${y} Q ${x + barWidth} ${y} ${x + barWidth} ${y + r} L ${x + barWidth} ${plotHeight} Z`;

              return (
                <g key={item.label + index}>
                  {d && (
                    <path
                      d={d}
                      fill={`var(--chart-${tone})`}
                      opacity={active === null || active === index ? 1 : 0.42}
                      className="grow-bar"
                      style={{ animationDelay: `${index * 26}ms` }}
                    />
                  )}
                  {/* Hit target spans the whole band, so a 4px bar is still easy
                      to hover. */}
                  <rect
                    x={index * band}
                    y="0"
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setActive(index)}
                  />
                </g>
              );
            })}

            {data.map((item, index) => {
              const step = Math.ceil(data.length / 12);
              if (index % step !== 0 && index !== data.length - 1) return null;
              return (
                <text
                  key={item.label + index}
                  x={index * band + band / 2}
                  y={plotHeight + 17}
                  textAnchor="middle"
                  className="fill-muted text-2xs"
                >
                  {item.label}
                </text>
              );
            })}
          </g>
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs shadow-lg"
            style={{
              left: `${((padding.left + active * band + band / 2) / width) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <span className="text-muted">{data[active].label}</span>{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {format(data[active].value)}
            </span>
          </div>
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-1.5 pr-3 font-medium text-muted">Label</th>
                <th scope="col" className="py-1.5 pr-3 font-medium text-muted">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={item.label + index} className="border-b border-border/60">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-muted">{item.label}</th>
                  <td className="py-1.5 pr-3 tabular-nums text-foreground">{format(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

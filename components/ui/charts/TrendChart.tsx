"use client";

import { useId, useMemo, useState } from "react";
import { areaPath, compact, linePath, niceTicks, scale, type Point } from "./geometry";

export type TrendSeries = {
  /** Names the series in the legend, the tooltip and the table. */
  name: string;
  values: number[];
  /** 1 = mail we sent (blue), 2 = replies we got back (green). */
  tone: 1 | 2;
};

/**
 * The change-over-time chart: reply rate, sending volume, anything with a date
 * on the bottom.
 *
 * Rules this follows that are easy to get wrong, and why:
 *
 * **One y-axis, always.** Sent and replied are plotted on the same scale even
 * though replies are a fraction of sends. A second axis lets you place two
 * unrelated scales so the lines cross wherever the author wants, which is the
 * most common way a chart misleads without containing a single false number. If
 * the two series are too far apart to read together, that is a signal to render
 * two charts, not to add an axis.
 *
 * **A legend whenever there are two series, never when there is one.** With one
 * series the title already says what is plotted and a single-swatch box just
 * restates it. With two, colour alone is not an acceptable identity channel.
 *
 * **Values are labelled selectively.** The endpoint carries a direct label; every
 * other value lives in the axis, the tooltip and the table. A number on every
 * point is noise that stops being read.
 *
 * **The table is not a fallback, it is part of the chart.** It is what makes the
 * numbers available to a screen reader, to someone who cannot separate the hues,
 * and to anyone who wants to copy a figure out.
 */
export function TrendChart({
  series,
  labels,
  height = 220,
  format = (value: number) => value.toLocaleString(),
  caption,
}: {
  series: TrendSeries[];
  /** One x-axis label per data point, e.g. "Mon" or "08-14". */
  labels: string[];
  height?: number;
  format?: (value: number) => string;
  caption?: string;
}) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const width = 720;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const { max, ticks, paths } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter(Number.isFinite);
    // Baseline is always zero for a volume chart. Starting a count axis anywhere
    // else exaggerates every difference on it, which is the other classic way to
    // mislead with true numbers.
    const rawMax = all.length ? Math.max(...all) : 0;
    const axisTicks = niceTicks(0, rawMax || 1, 3);
    const axisMax = Math.max(...axisTicks, rawMax || 1);

    const built = series.map((s) => {
      const points: Point[] = s.values.map((value, index) => ({
        x: scale(index, 0, Math.max(1, s.values.length - 1), 0, plotWidth),
        y: scale(value, 0, axisMax, plotHeight, 0),
      }));
      return { ...s, points };
    });

    return { max: axisMax, ticks: axisTicks, paths: built };
  }, [series, plotWidth, plotHeight]);

  const count = labels.length;
  const showLegend = series.length >= 2;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={
            caption ??
            `${series.map((s) => s.name).join(" and ")} over ${count} points`
          }
          onMouseLeave={() => setActive(null)}
          className="block"
        >
          <defs>
            {paths.map((s) => (
              <linearGradient key={s.name} id={`${gradientId}-${s.tone}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--chart-${s.tone})`} stopOpacity="0.16" />
                <stop offset="100%" stopColor={`var(--chart-${s.tone})`} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          <g transform={`translate(${padding.left},${padding.top})`}>
            {/* Recessive hairline grid. Solid, never dashed: a dashed gridline
                competes with the data for attention it has not earned. */}
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

            {paths.map((s) => (
              <g key={s.name}>
                <path d={areaPath(s.points, plotHeight)} fill={`url(#${gradientId}-${s.tone})`} />
                <path
                  d={linePath(s.points)}
                  fill="none"
                  stroke={`var(--chart-${s.tone})`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="draw-line"
                  style={{ ["--draw-length" as string]: "2400" }}
                />
              </g>
            ))}

            {/* Crosshair and per-point markers for the hovered column. */}
            {active !== null && (
              <g pointerEvents="none">
                <line
                  x1={scale(active, 0, Math.max(1, count - 1), 0, plotWidth)}
                  y1="0"
                  x2={scale(active, 0, Math.max(1, count - 1), 0, plotWidth)}
                  y2={plotHeight}
                  stroke="var(--muted)"
                  strokeWidth="1"
                  opacity="0.4"
                />
                {paths.map((s) =>
                  s.points[active] ? (
                    <circle
                      key={s.name}
                      cx={s.points[active].x}
                      cy={s.points[active].y}
                      r="4.5"
                      fill={`var(--chart-${s.tone})`}
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />
                  ) : null
                )}
              </g>
            )}

            {/* Hit targets: one full-height band per point, so the pointer never
                has to find a 2px line. */}
            {labels.map((label, index) => (
              <rect
                key={label + index}
                x={index === 0 ? 0 : scale(index - 0.5, 0, Math.max(1, count - 1), 0, plotWidth)}
                y="0"
                width={plotWidth / Math.max(1, count - 1)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActive(index)}
              />
            ))}

            {/* x labels, thinned so they never collide on a narrow card. */}
            {labels.map((label, index) => {
              const step = Math.ceil(count / 7);
              if (index % step !== 0 && index !== count - 1) return null;
              return (
                <text
                  key={label + index}
                  x={scale(index, 0, Math.max(1, count - 1), 0, plotWidth)}
                  y={plotHeight + 18}
                  textAnchor="middle"
                  className="fill-muted text-2xs"
                >
                  {label}
                </text>
              );
            })}
          </g>
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(scale(active, 0, Math.max(1, count - 1), padding.left, width - padding.right) / width) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-semibold text-foreground">{labels[active]}</p>
            {series.map((s) => (
              <p key={s.name} className="mt-1 flex items-center gap-2 whitespace-nowrap text-muted">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: `var(--chart-${s.tone})` }}
                />
                {s.name}
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {format(s.values[active] ?? 0)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-2 text-xs text-muted">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: `var(--chart-${s.tone})` }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-1.5 pr-3 font-medium text-muted">Point</th>
                {series.map((s) => (
                  <th key={s.name} scope="col" className="py-1.5 pr-3 font-medium text-muted">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label + index} className="border-b border-border/60">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-muted">{label}</th>
                  {series.map((s) => (
                    <td key={s.name} className="py-1.5 pr-3 tabular-nums text-foreground">
                      {format(s.values[index] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

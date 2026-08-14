import { linePath, areaPath, scale, type Point } from "./geometry";

/**
 * A trend small enough to live in a table cell.
 *
 * Deliberately a server component with no interactivity. A sparkline is 64px
 * wide; a crosshair and tooltip on something that size would be a worse way of
 * reading a number than the number already sitting in the next column. What it
 * owes the reader instead is a real text alternative, so the `aria-label` states
 * the direction and the endpoints rather than announcing "chart".
 *
 * No axes, no grid, no labels. The row it sits in supplies all of that context,
 * which is the whole reason a sparkline can be this small.
 */
export function Sparkline({
  data,
  width = 72,
  height = 24,
  series = 1,
  label,
}: {
  data: number[];
  width?: number;
  height?: number;
  /** 1 = mail we sent (blue), 2 = replies we got back (green). */
  series?: 1 | 2;
  /** What the numbers are, for the screen-reader sentence. */
  label: string;
}) {
  const usable = data.filter((value) => Number.isFinite(value));
  if (usable.length < 2) {
    // One point is not a trend. A flat line pretending otherwise is worse than
    // an honest dash.
    return (
      <span className="inline-block text-xs text-muted" aria-label={`${label}: not enough history yet`}>
        &mdash;
      </span>
    );
  }

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  // 2px inset top and bottom so the 2px stroke is never clipped by the viewBox.
  const points: Point[] = usable.map((value, index) => ({
    x: scale(index, 0, usable.length - 1, 1, width - 1),
    y: scale(value, min, max, height - 3, 3),
  }));
  const last = points[points.length - 1];

  const first = usable[0];
  const final = usable[usable.length - 1];
  const direction = final > first ? "up" : final < first ? "down" : "flat";
  const stroke = series === 1 ? "var(--chart-1)" : "var(--chart-2)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${direction}, from ${first.toLocaleString()} to ${final.toLocaleString()}`}
      className="overflow-visible"
    >
      <path d={areaPath(points, height)} fill={stroke} opacity="0.1" />
      <path
        d={linePath(points)}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The emphasised endpoint: where the series got to is the one value a
          glance is actually after. The surface ring keeps it legible where it
          sits on top of the line. */}
      <circle cx={last.x} cy={last.y} r="3.5" fill={stroke} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

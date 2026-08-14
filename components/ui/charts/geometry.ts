/**
 * Shared path maths for the chart primitives.
 *
 * The only interesting decision here is the smoothing, and it is a correctness
 * decision rather than a cosmetic one.
 *
 * The usual way to round off a line chart is a Catmull-Rom or cardinal spline.
 * Both overshoot: given the values 10, 10, 40, the curve between the first two
 * points dips *below* 10 before climbing, and given 40, 10, 10 it dips below the
 * floor. On a chart of emails sent that draws a number nobody sent, and on a
 * chart of a rate it can draw a negative percentage. A pretty curve that reports
 * values the data does not contain is a lie told slowly.
 *
 * Fritsch-Carlson monotone cubic interpolation solves exactly this: it is a
 * cubic Hermite spline whose tangents are clamped so the curve can never leave
 * the interval between the two points it connects. Where the data rises the
 * curve rises, where the data is flat the curve is flat, and a local minimum in
 * the output is always a local minimum in the input.
 */

export type Point = { x: number; y: number };

/** Linear scale from a data domain onto a pixel range. */
export function scale(value: number, domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): number {
  if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
  const t = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + t * (rangeMax - rangeMin);
}

/**
 * Nice round axis ticks. `1..1000` becomes 0 / 500 / 1,000 rather than
 * 0 / 333.33 / 666.67, because an axis whose labels need reading twice has
 * stopped being an axis.
 */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (max <= min) return [min];
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    if (value >= min - step * 0.001) ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

/** Fritsch-Carlson tangents: the clamping step that makes the curve honest. */
function monotoneTangents(points: Point[]): number[] {
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0] ?? 0;
  tangents[n - 1] = slopes[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    // A sign change means this point is a local extreme. Flattening the tangent
    // there is what stops the curve sailing past it.
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const magnitude = Math.hypot(alpha, beta);
    // Outside a circle of radius 3 the spline is no longer monotone, so pull the
    // pair back onto it.
    if (magnitude > 3) {
      const factor = 3 / magnitude;
      tangents[i] = factor * alpha * slopes[i];
      tangents[i + 1] = factor * beta * slopes[i];
    }
  }
  return tangents;
}

/** An SVG path through the points that never leaves their range. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const tangents = monotoneTangents(points);
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    // Hermite to cubic-bezier: control points sit one third along the tangent.
    const c1x = points[i].x + dx / 3;
    const c1y = points[i].y + (tangents[i] * dx) / 3;
    const c2x = points[i + 1].x - dx / 3;
    const c2y = points[i + 1].y - (tangents[i + 1] * dx) / 3;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return path;
}

/** The same path closed down to a baseline, for the area wash. */
export function areaPath(points: Point[], baseline: number): string {
  if (points.length === 0) return "";
  const line = linePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

/** 1,284 → "1,284"; 12,900 → "12.9K"; 4,200,000 → "4.2M". */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

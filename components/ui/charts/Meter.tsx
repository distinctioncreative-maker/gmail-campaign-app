/**
 * One proportion bar for the whole product.
 *
 * There were nineteen hand-rolled versions of this across twelve files: send
 * progress, daily allowance, onboarding completion, setup checklists, per-rep
 * leaderboards, wizard steps. Each was a track div and a fill div with an inline
 * width percentage, and because each was written separately they disagreed about
 * height, radius, colour, and whether the track and fill were even distinguishable.
 * One of them shipped as `bg-surface-2` on `bg-surface-2`, which is 1.00:1 and
 * therefore an invisible bar.
 *
 * Two things this fixes beyond consistency.
 *
 * **Track and fill can no longer collide.** The track is derived from the fill
 * with `color-mix` rather than picked independently, so they are always steps of
 * one ramp and the bar is always visible on any surface.
 *
 * **State reads without the number.** A meter that is only ever the accent
 * colour makes the reader parse a percentage to find out whether it is good
 * news. `tone` carries meaning: neutral progress, a good outcome, something
 * approaching a limit, something over one. That is the difference between a
 * decoration and an instrument.
 *
 * Not a chart, so no hover layer and no table view: the number it represents is
 * always printed next to it by the caller, which is the accessible text and the
 * precise value at once. The bar itself is `aria-hidden` for that reason, with
 * the semantics carried by a `role="progressbar"` wrapper only when there is no
 * adjacent label to do the job.
 */
export type MeterTone = "progress" | "good" | "warning" | "danger";

const FILL: Record<MeterTone, string> = {
  // Blue: work happening. Green: work finished, or a number where up is good.
  progress: "var(--primary)",
  good: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export function Meter({
  value,
  max = 100,
  tone = "progress",
  height = 6,
  /** Set when the meter stands alone with no printed figure beside it. */
  label,
  /**
   * Draws in from the left on first paint. Used where several meters appear
   * together and the group reads better arriving than existing, chiefly the
   * report funnel. Off by default: a meter inside a table row that redraws on
   * every filter change would be noise.
   */
  animate = false,
  className = "",
}: {
  value: number;
  max?: number;
  tone?: MeterTone;
  height?: number;
  label?: string;
  animate?: boolean;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  // Clamped, because a bar wider than its track is a layout bug rather than a
  // data point, and a negative one silently disappears.
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const fill = FILL[tone];

  return (
    <div
      className={`overflow-hidden rounded-full ${className}`}
      style={{
        height,
        // Derived from the fill, never chosen separately: this is what makes a
        // track-on-track collision impossible.
        background: `color-mix(in srgb, ${fill} 16%, var(--surface-2))`,
      }}
      {...(label
        ? {
            role: "progressbar",
            "aria-valuenow": Math.round(pct),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-label": label,
          }
        : { "aria-hidden": true })}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-[--dur-slow] ease-[--ease-out] ${animate ? "grow-bar" : ""}`}
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}

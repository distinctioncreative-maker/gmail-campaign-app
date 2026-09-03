import type { CSSProperties } from "react";

/**
 * The Cadence Line.
 *
 * Cadence exists to move things: a list becomes messages, messages join a
 * queue, the queue spreads across inboxes and across the day, mail goes out,
 * replies come back. Almost nothing in the product said that visually. The
 * wordmark was the only thing identifying it.
 *
 * So the motif is several thin trajectories running through a system, diverging
 * and rejoining. It is deliberately geometry rather than an illustration: it can
 * be a rule between sections, a loading state, a progress bar, or a diagram of a
 * campaign's journey, and in each case it is the same lines doing a different
 * job. A logo that only appears in the corner is decoration; a geometry that
 * turns up wherever the product is doing something is a brand.
 *
 * Rules this component holds so call sites cannot drift:
 *
 * **Indigo is what we sent, mint is what came back.** The same meaning the two
 * accents carry everywhere else. Nothing here invents a third colour.
 *
 * **Nothing loops in peripheral vision.** `loading` animates because a loading
 * state is a claim that work is happening. `separator` and `flow` are static.
 * That distinction is the whole motion philosophy in one component.
 *
 * **No animation dependency.** Pure SVG and CSS, and it all stops under
 * prefers-reduced-motion, which is handled once in globals.css rather than at
 * each call site.
 *
 * It is a server component: no state, no effects, no client bundle.
 */

export type CadenceLineVariant = "separator" | "loading" | "progress" | "flow";

/**
 * The shared geometry: four trajectories that branch and rejoin across a
 * 240x48 field. Written once, reused by every variant, so the shape is
 * recognisably the same object at every size and job.
 */
const PATHS = [
  // Top lane runs clear, then drops to join the trunk.
  "M0 8 H150 Q162 8 162 20 V28 Q162 40 174 40 H240",
  // Second lane branches down early and runs long.
  "M0 20 H74 Q86 20 86 32 V36 Q86 40 98 40 H240",
  // Third lane stays low the whole way: the direct path.
  "M0 40 H240",
  // Fourth rises to the top lane, which is the reply coming back.
  "M0 32 H40 Q52 32 52 20 V16 Q52 8 64 8 H240",
] as const;

function Field({
  className = "",
  children,
  style,
}: {
  className?: string;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 240 48"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export function CadenceLine({
  variant = "separator",
  /** 0 to 1. Only meaningful for `progress`. */
  value = 0,
  className = "",
  /** Accessible description. Omit for decoration, which is the default. */
  label,
}: {
  variant?: CadenceLineVariant;
  value?: number;
  className?: string;
  label?: string;
}) {
  if (variant === "progress") {
    const pct = Math.max(0, Math.min(1, value));
    return (
      <div
        className={`cadence-progress ${className}`}
        role={label ? "progressbar" : undefined}
        aria-valuenow={label ? Math.round(pct * 100) : undefined}
        aria-valuemin={label ? 0 : undefined}
        aria-valuemax={label ? 100 : undefined}
        aria-label={label}
      >
        <span className="cadence-progress-track" />
        <span className="cadence-progress-fill" style={{ width: `${pct * 100}%` }} />
        {/* The leading node. It is what makes a bar read as something moving
            rather than as a measurement, and it is the one place progress is
            allowed to draw attention. */}
        <span className="cadence-progress-node" style={{ left: `${pct * 100}%` }} />
      </div>
    );
  }

  if (variant === "loading") {
    return (
      <span className={`cadence-loading ${className}`} role="status" aria-label={label ?? "Working"}>
        <Field className="cadence-loading-svg">
          {PATHS.map((d, i) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="cadence-loading-path"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </Field>
      </span>
    );
  }

  if (variant === "flow") {
    return (
      <Field className={`cadence-flow ${className}`} style={{ height: "3rem" }}>
        {PATHS.map((d, i) => (
          <path
            key={d}
            d={d}
            // The last lane is the reply returning, so it takes mint. Everything
            // else is outbound.
            stroke={i === PATHS.length - 1 ? "var(--success)" : "var(--primary)"}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={i === PATHS.length - 1 ? 0.9 : 0.55}
          />
        ))}
      </Field>
    );
  }

  return (
    <Field className={`cadence-separator ${className}`} style={{ height: "3rem" }}>
      {PATHS.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      ))}
    </Field>
  );
}

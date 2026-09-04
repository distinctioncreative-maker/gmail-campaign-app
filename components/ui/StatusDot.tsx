import type { ReactNode } from "react";

/**
 * The small coloured dot that says what state something is in.
 *
 * Four places drew one by hand, and all four reached for a `live-dot` class
 * that is defined nowhere in the codebase. It shipped as a no-op: LiveRefresh
 * even branches on it (`pulse ? "" : "live-dot"`), so the branch that was meant
 * to animate rendered a completely static dot. Nothing failed, because an
 * undefined class name is not an error in CSS or in JSX.
 *
 * On motion, this follows the rule the rest of the system follows: nothing
 * loops in peripheral vision. A dot that pulses forever is not saying "live",
 * it is competing with the content for attention and winning, and a list of
 * campaign cards is peripheral the moment you are reading a different one.
 * "Live" is already carried by the colour and by the word next to it.
 *
 * So there is no looping state at all. The only motion available is `flash`: a
 * single halo, once, when something has just happened. That is the one case
 * where movement carries information the static rendering does not, because
 * "the number you are looking at changed a moment ago" has no other way to be
 * said. It stops under prefers-reduced-motion.
 *
 * Colour is never the only signal. Every dot carries text, either the visible
 * label beside it or a screen-reader one, because a red and a green circle are
 * the same circle to roughly one man in twelve.
 */
export type StatusTone = "live" | "idle" | "warning" | "danger" | "neutral";

const TONE: Record<StatusTone, string> = {
  live: "bg-success",
  idle: "bg-muted-2",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-2",
};

export function StatusDot({
  tone = "neutral",
  children,
  /** Announce the state when there is no visible label to carry it. */
  srLabel,
  /**
   * Play a single halo, once. For the moment something has just happened, not
   * for an ongoing state: there is deliberately no looping option.
   */
  flash = false,
  className = "",
}: {
  tone?: StatusTone;
  children?: ReactNode;
  srLabel?: string;
  flash?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[tone]} ${flash ? "status-dot-flash" : ""}`}
      />
      {children}
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </span>
  );
}

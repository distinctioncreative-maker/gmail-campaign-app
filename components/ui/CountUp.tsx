"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to its value.
 *
 * This is the one piece of motion in the product that is not decoration. A
 * number already sitting at 1,284 is a fact on a page; a number that arrives at
 * 1,284 is the product telling you it did that. It is most of why a Robinhood
 * tile feels alive, and it costs one animation-frame loop.
 *
 * Four properties that matter more than the effect itself:
 *
 * **The server renders the real value.** This used to initialise at zero, which
 * meant all 28 call sites shipped a literal "0" in their server HTML: a crawler
 * saw zero, a client with JavaScript disabled kept seeing zero forever, and
 * everyone else got a visible flash of zero before hydration. The initial state
 * is now the target, and the effect drops to zero only after confirming it is
 * running in a browser that wants motion. Every count-up that flashes a zero
 * does so because it was initialised at zero.
 *
 * **Elapsed time drives it, not frame count.** Reading the clock is what makes
 * `duration` mean what it says; a per-frame increment finishes twice as fast on
 * a 120Hz display as on a 60Hz one.
 *
 * **Reduced motion means no animation, not a faster one.** Someone who asked for
 * stillness often did so because movement makes them ill, and a brief animation
 * is still animation. The previous version still spun up a frame loop and simply
 * jumped to the end on the first tick.
 *
 * **A live update animates from where it was, not from zero.** When a figure
 * ticks up while someone is watching, restarting from zero would read as the
 * page reloading rather than the number changing.
 */
export function CountUp({
  value,
  decimals = 0,
  /** Leading unit, for currency. Kept inside the tabular-nums span so a ticking
   * figure does not shift the symbol along with it. */
  prefix = "",
  suffix = "",
  duration = 1100,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  // The target, so server output and first client paint agree.
  const [n, setN] = useState(value);
  const raf = useRef<number | undefined>(undefined);
  /** Last settled value, so a live update tweens rather than restarting. */
  const settled = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value)) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // First mount counts up from zero; afterwards from wherever it settled.
    const origin = settled.current ?? 0;

    // Nothing worth animating: a figure moving 0 to 1 reads as a glitch, and a
    // value that has not changed should not replay.
    if (reduce || duration <= 0 || Math.abs(value - origin) < 2) {
      settled.current = value;
      setN(value);
      return;
    }

    const start = performance.now();
    setN(origin);

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic, close enough to --ease-out that the numbers and the
      // surfaces around them read as one system.
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setN(origin + (value - origin) * eased);
        raf.current = requestAnimationFrame(tick);
      } else {
        // Land exactly. Easing arithmetic can finish a fraction short, and a
        // total that reads 1,283 when it is 1,284 is worse than no animation.
        setN(value);
        settled.current = value;
      }
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const text = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return (
    // The server prints the settled figure and the client immediately begins
    // from zero, so the two disagree by design for one frame.
    <span className="tabular-nums" suppressHydrationWarning>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

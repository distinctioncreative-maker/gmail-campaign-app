"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";

export type Signal = {
  /** Short uppercase kicker, e.g. "Best performer". */
  kicker: string;
  /** The figure itself. Rendered through CountUp when numeric. */
  value: number | string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** One sentence of plain English explaining why the figure matters. */
  sentence: string;
  icon: IconName;
  href: string;
  cta: string;
  tone?: "default" | "revenue" | "warning";
};

const SLIDE_MS = 6000;

/**
 * A media query is external state, so it is read with the hook built for
 * external state. Doing this with useEffect + setState works but schedules a
 * second render on every mount purely to discover something the browser already
 * knew, and React's lint rules now flag it for exactly that reason. The server
 * snapshot is `false`: server output must match the no-preference case, which is
 * what the markup is written for.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/** Same shape, for whether the tab is actually being looked at. */
function useTabHidden(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.hidden,
    () => false
  );
}

/**
 * The rotating headline band on Home.
 *
 * A dashboard that opens on a static grid of numbers tells you everything and
 * emphasises nothing. This picks the handful of facts actually worth knowing
 * this morning and gives each one the whole width for a few seconds: the figure
 * at headline size, a sentence saying why it matters, and the one link you would
 * want next. It replaced a single-line text link that carried one of these facts
 * and no emphasis at all.
 *
 * The things that make an auto-advancing component tolerable rather than
 * annoying, all of which are easy to leave out:
 *
 * **It stops when you are reading it.** Hover, keyboard focus anywhere inside,
 * and a backgrounded tab all pause the timer. A carousel that advances out from
 * under the cursor is the single most complained-about pattern on the web, and
 * it is nearly always because nobody wired the pause.
 *
 * **It is operable without the timer.** Arrow keys move between slides, the dots
 * are real buttons, and any manual move cancels auto-advance permanently: having
 * taken control, you should keep it for the rest of the visit.
 *
 * **Reduced motion means it does not move at all.** Not a faster crossfade: no
 * auto-advance, no transition. The dots still work, so nothing is unreachable.
 *
 * **It renders slide one on the server**, so the panel is correct before
 * hydration and for a client that never runs the script.
 */
export function SignalReel({ signals }: { signals: Signal[] }) {
  const [index, setIndex] = useState(0);
  /** Set once the reader takes over; auto-advance never resumes after that. */
  const [manual, setManual] = useState(false);
  /** Pointer or keyboard focus is inside the panel. */
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduced = usePrefersReducedMotion();
  // A timer ticking in a tab nobody is looking at is waste, and it also means
  // coming back to the tab lands you midway through a slide you never saw.
  const hidden = useTabHidden();

  const stopped = manual || hovered || hidden || reduced || signals.length < 2;

  useEffect(() => {
    if (stopped) return;
    timer.current = setTimeout(
      () => setIndex((current) => (current + 1) % signals.length),
      SLIDE_MS
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, stopped, signals.length]);

  const go = useCallback(
    (next: number) => {
      setManual(true);
      setIndex((next + signals.length) % signals.length);
    },
    [signals.length]
  );

  if (signals.length === 0) return null;
  const signal = signals[index];
  const toneClass =
    signal.tone === "revenue"
      ? "text-revenue"
      : signal.tone === "warning"
        ? "text-warning"
        : "text-foreground";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="signal-reel card card-hover relative overflow-hidden p-6 sm:p-7"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        // Only resume once focus has genuinely left the panel, not while it is
        // moving between the dots inside it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHovered(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(index - 1);
        }
      }}
    >
      <div className="drift-field" aria-hidden />

      {/* keyed so each slide mounts fresh: the figure re-counts and the copy
          rises, which is what makes the change register as an event */}
      <div
        key={index}
        className={reduced ? "relative" : "relative animate-rise"}
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="display-label flex items-center gap-2">
          <Icon name={signal.icon} size={14} aria-hidden />
          {signal.kicker}
        </p>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <p className={`display-figure leading-none ${toneClass}`}>
            {typeof signal.value === "number" ? (
              <CountUp
                value={signal.value}
                decimals={signal.decimals}
                prefix={signal.prefix}
                suffix={signal.suffix}
              />
            ) : (
              signal.value
            )}
          </p>
          <Link href={signal.href} className="btn-ghost px-4 py-2 text-sm">
            {signal.cta}
            <Icon name="chevronRight" size={15} aria-hidden />
          </Link>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{signal.sentence}</p>
      </div>

      {signals.length > 1 && (
        <div className="relative mt-6 flex items-center gap-2">
          {signals.map((item, i) => (
            <button
              key={item.kicker}
              type="button"
              onClick={() => go(i)}
              aria-label={item.kicker}
              aria-current={i === index}
              className="reel-dot"
              data-active={i === index || undefined}
            >
              <span
                aria-hidden
                className="reel-dot-fill"
                data-running={i === index && !stopped ? "" : undefined}
                style={{ animationDuration: `${SLIDE_MS}ms` }}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

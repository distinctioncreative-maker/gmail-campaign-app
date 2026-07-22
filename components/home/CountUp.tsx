"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated number that counts up from 0 to `value` on mount — the little
 * motion that makes a dashboard feel alive. Respects reduced-motion.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 1100,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const text =
    decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return (
    <span className="tabular-nums">
      {text}
      {suffix}
    </span>
  );
}

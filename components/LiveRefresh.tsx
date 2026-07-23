"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page live: periodically calls router.refresh() so
 * counters (sent, replies, …) tick up on their own without a manual reload.
 * Pauses while the tab is hidden and refreshes immediately on refocus.
 * Renders a small "Live" indicator.
 */
export function LiveRefresh({ intervalMs = 15000, label = "Live" }: { intervalMs?: number; label?: string }) {
  const router = useRouter();
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      router.refresh();
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
    };
    const timer = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-green-500 ${pulse ? "" : "live-dot"}`}
        style={pulse ? { boxShadow: "0 0 0 4px rgba(34,197,94,0.25)", transition: "box-shadow 0.9s ease" } : undefined}
      />
      {label}
    </span>
  );
}

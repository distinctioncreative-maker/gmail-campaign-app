"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusDot } from "@/components/ui/StatusDot";

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
    /* Neutral, not mint. This dot says "the page is refreshing itself", which
       is a system state, and it sits inside a card where mint already means
       replies. Two meanings for one colour eight pixels apart is worse than no
       colour at all. The flash on each refresh is the actual signal; a standing
       mint dot added nothing and spent a colour that was taken. */
    <StatusDot tone="idle" flash={pulse} className="text-xs font-medium text-muted">
      {label}
    </StatusDot>
  );
}

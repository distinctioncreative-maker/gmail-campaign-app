"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * The moment the product exists for. Launching a campaign was previously a
 * silent redirect, which made the single most consequential action in the app
 * feel like a page load. This marks it: a brief, dismissible banner that names
 * what is now happening and where the payoff will show up.
 *
 * It strips the ?launched flag from the URL on mount so a refresh or a shared
 * link never re-celebrates a campaign that has been running for a week.
 */
export function LaunchCelebration({
  recipientCount,
  startedNow,
}: {
  recipientCount: number;
  startedNow: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="animate-rise relative mb-4 overflow-hidden rounded-2xl border border-border bg-surface-2 p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-surface-2 blur-3xl"
      />
      <div className="relative flex items-start gap-4">
        <span className="bg-surface-2 text-foreground flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-brand-contrast shadow-md">
          <Icon name="rocket" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="display-title text-lg text-foreground">
            {startedNow ? "You are live." : "Campaign is ready."}
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {startedNow
              ? `${recipientCount.toLocaleString()} personalized email${
                  recipientCount === 1 ? "" : "s"
                } are queued and going out from your Gmail at the pace you set. Replies land in your inbox and show up on this page as they arrive.`
              : `${recipientCount.toLocaleString()} lead${
                  recipientCount === 1 ? " is" : "s are"
                } prepared. Press Start when you want the first email to go out.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted transition-colors duration-[--dur-fast] hover:bg-surface hover:text-foreground"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}

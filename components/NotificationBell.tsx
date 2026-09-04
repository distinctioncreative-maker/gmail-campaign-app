"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/LocalTime";
import { Popover } from "@/components/ui/Popover";

interface Notification {
  notificationId: string;
  title: string;
  body: string;
  severity: string;
  campaignId: string | null;
  read: boolean;
  createdAt: number;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setItems((await res.json()).notifications ?? []);
    } catch {
      // ignore transient errors
    }
  }

  useEffect(() => {
    // Poll for new notifications. setState happens only after the async
    // fetch resolves, not synchronously during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function markRead() {
    if (unread === 0) return;
    await fetch("/api/notifications", { method: "POST" });
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  return (
    <div data-tour="notif-bell">
      <Popover
        label="Notifications"
        align="end"
        /* A list to read, not a set of commands, so arrow keys stay with the
           content and the panel is a dialog rather than a menu. */
        role="dialog"
        panelClassName="w-80"
        onOpenChange={(open) => {
          if (open) void markRead();
        }}
        trigger={(props) => (
          <button
            {...props}
            aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            className="relative rounded-md p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-3xs font-medium text-danger-contrast">
                {unread}
              </span>
            )}
          </button>
        )}
      >
        {({ close }) => (
          <>
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
              Notifications
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((n) => (
                <div key={n.notificationId} className="border-b border-border px-4 py-3 last:border-0">
                  {n.campaignId ? (
                    <Link
                      href={`/campaigns/${n.campaignId}`}
                      onClick={close}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                  )}
                  <p className="text-sm text-muted">{n.body}</p>
                  <LocalTime value={n.createdAt} className="mt-1 block text-xs text-muted" />
                </div>
              ))
            )}
          </>
        )}
      </Popover>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/LocalTime";

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
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/notifications", { method: "POST" });
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    }
  }

  return (
    <div ref={ref} data-tour="notif-bell" className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative rounded-lg p-2 text-muted hover:bg-surface-2"
      >
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-3xs font-medium text-danger-contrast">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <div key={n.notificationId} className="border-b border-border px-4 py-3 last:border-0">
                  {n.campaignId ? (
                    <Link
                      href={`/campaigns/${n.campaignId}`}
                      onClick={() => setOpen(false)}
                      className="text-sm font-medium text-foreground hover:text-foreground"
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{n.title}</p>
                  )}
                  <p className="text-sm text-muted">{n.body}</p>
                  <LocalTime value={n.createdAt} className="mt-1 block text-xs text-muted" />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

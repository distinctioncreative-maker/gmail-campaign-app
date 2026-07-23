"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * A card whose body can be collapsed/hidden, with the choice remembered in
 * localStorage. Used for optional settings sections (e.g. the sender profile)
 * so users who don't need them can tuck them away.
 */
export function CollapsibleCard({
  title,
  description,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let next = defaultOpen;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "open" || saved === "closed") next = saved === "open";
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(next);
    setReady(true);
  }, [storageKey, defaultOpen]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-6 text-left transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <h2 className="font-medium">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <Icon name="chevronDown" size={18} />
        </span>
      </button>
      {ready && open && (
        <div className="animate-rise border-t border-border p-6 pt-5">{children}</div>
      )}
    </div>
  );
}

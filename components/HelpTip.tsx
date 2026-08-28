"use client";

import { useState } from "react";

/** A small "?" that reveals a plain-language explanation on hover/tap.
 * Use next to any label a non-technical user might not understand. */
export function HelpTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ?? "Help"}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-border text-3xs font-bold text-muted transition-opacity hover:opacity-70"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs font-normal leading-relaxed text-background shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

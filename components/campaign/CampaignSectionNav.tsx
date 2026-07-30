"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#controls", label: "Controls" },
  { href: "#recipients", label: "Recipients" },
  { href: "#activity", label: "Activity" },
] as const;

export function CampaignSectionNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <nav
        aria-label="Campaign sections"
        className="mt-5 rounded-xl border border-border bg-surface p-1"
      >
        <div className="hidden gap-1 sm:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="min-w-max rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 sm:hidden">
          {SECTIONS.slice(0, 2).map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="flex min-h-11 items-center justify-center rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            aria-haspopup="dialog"
          >
            <Icon name="more" size={16} />
            More
          </button>
        </div>
      </nav>

      <dialog
        ref={dialogRef}
        aria-labelledby="campaign-sections-title"
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/35"
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        onCancel={close}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="campaign-sections-title" className="text-sm font-semibold">
            Campaign sections
          </h2>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Close campaign sections"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="grid gap-1 p-3">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={close}
              className="flex min-h-12 items-center justify-between rounded-xl px-3 text-sm font-medium hover:bg-surface-2"
            >
              {section.label}
              <Icon name="chevronRight" size={17} />
            </a>
          ))}
        </div>
      </dialog>
    </>
  );
}

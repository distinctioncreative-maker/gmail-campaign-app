"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nextRowIndex, shouldIgnoreShortcut } from "@/lib/ui/keyboard";

/**
 * Keyboard navigation for the reply inbox.
 *
 * Driven off the DOM rather than off React state, which is what lets the table
 * stay a server component: rows carry `data-reply-row` and `data-reply-href`, and
 * this reads them. Turning the whole table into a client component to get
 * arrow-key movement would have shipped every reply's data to the browser as
 * props for the sake of two keystrokes.
 *
 * The backlog also asked for `e` to archive. There is no archive action on a
 * reply anywhere in the product, so binding a key to it would mean inventing a
 * feature inside a keyboard shortcut. The keys here map to things that exist.
 */

const HINT = "j and k to move, Enter to open, Escape to clear";

export function RepliesKeyboardNav() {
  const router = useRouter();
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    function rows(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>("[data-reply-row]"));
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        shouldIgnoreShortcut({
          tagName: target?.tagName ?? "",
          isEditable: target?.isContentEditable ?? false,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
        })
      ) {
        return;
      }

      const all = rows();
      if (all.length === 0) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setIndex((prev) => {
          const next = nextRowIndex(prev, event.key === "j" ? 1 : -1, all.length);
          all[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
        return;
      }

      if (event.key === "Escape") {
        setIndex(-1);
        return;
      }

      if (event.key === "Enter") {
        setIndex((prev) => {
          const href = prev >= 0 ? all[prev]?.dataset.replyHref : undefined;
          if (href) router.push(href);
          return prev;
        });
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  // The highlight is applied to the DOM directly for the same reason the rows
  // are read from it: the rows are not this component's to re-render.
  useEffect(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reply-row]"));
    all.forEach((row, i) => {
      row.classList.toggle("bg-surface-2", i === index);
      row.setAttribute("aria-current", i === index ? "true" : "false");
    });
  }, [index]);

  return (
    <p className="mt-2 hidden text-xs text-muted sm:block" aria-live="polite">
      {index >= 0 ? `Row ${index + 1} selected. ${HINT}.` : HINT}
    </p>
  );
}

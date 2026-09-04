"use client";

import { useEffect, useId, useState, type ReactElement, type ReactNode } from "react";

/**
 * A short explanation attached to a control.
 *
 * There were two ways to do this and both were broken in a different way.
 *
 * The native `title` attribute, on sixteen elements: it waits about a second
 * before appearing, cannot be styled, cannot be reached by keyboard in most
 * browsers, and does not exist at all on touch. It is the same category of
 * thing as the native prompt: operating-system chrome standing in for a piece
 * of the product.
 *
 * HelpTip, on eight: styled correctly, but it put `role="tooltip"` on a span
 * with no id and never pointed the trigger at it with aria-describedby. A
 * tooltip role does nothing on its own; the association is the entire
 * mechanism. So a screen reader user heard "Help, button" and never once got
 * the sentence the tip existed to deliver. It also closed on mouseleave even
 * when it had been opened by a click, and had no Escape.
 *
 * This does the four things a tooltip has to do: appear on hover AND on focus,
 * because a keyboard user gets there by focus; associate itself with its
 * trigger so it is announced; close on Escape, because a tip covering the thing
 * underneath it needs a way out that is not "move the mouse correctly"; and
 * stay open while the pointer is inside it, so a tip containing a link is
 * reachable.
 *
 * It is not a replacement for a label. If a control has no accessible name,
 * the fix is a name, not a tip.
 */
export function Tooltip({
  content,
  children,
  placement = "top",
  className = "",
}: {
  content: ReactNode;
  /** The trigger. Receives aria-describedby, so it must spread its props. */
  children: (props: {
    "aria-describedby": string | undefined;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => ReactElement;
  placement?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      {children({
        // Only while open: describedby pointing at an element that is not in
        // the document is ignored by some screen readers and read as empty by
        // others, and neither is what the sentence is for.
        "aria-describedby": open ? id : undefined,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      })}
      {open && (
        <span
          id={id}
          role="tooltip"
          // Kept open while the pointer is over the tip itself, so a tip with a
          // link in it can be reached rather than vanishing on the way.
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={`tooltip-panel ${placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/**
 * The question mark beside a label a non-technical reader might not know.
 *
 * Kept as its own export because the affordance is part of the meaning: a "?"
 * says "there is an explanation here", which a bare hover target does not. The
 * behaviour underneath is Tooltip's.
 */
export function HelpTip({ text, label }: { text: string; label?: string }) {
  return (
    <Tooltip content={text}>
      {(props) => (
        <button
          {...props}
          type="button"
          aria-label={label ?? "Help"}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-border text-3xs font-bold text-muted transition-opacity hover:opacity-70"
        >
          ?
        </button>
      )}
    </Tooltip>
  );
}

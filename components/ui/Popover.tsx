"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A button that opens a panel anchored to it.
 *
 * Two of these existed already, written independently, and they had diverged
 * exactly the way independently-written popovers always do. The account menu
 * handled Escape, returned focus to its trigger, wired aria-expanded,
 * aria-haspopup and aria-controls, roved arrow keys across its items, attached
 * its listeners only while open, and sat at z-50. The notification bell did the
 * outside click and nothing else: no Escape, no focus return, no aria at all,
 * a document listener bound for the lifetime of the page whether the panel was
 * open or not, and a z-10 panel that any of the app's z-40 surfaces would cover.
 *
 * That is not a case of one author being careless. It is what happens when a
 * behaviour has no home: the second implementation is written from memory of
 * what a popover looks like rather than of what it has to do. So the behaviour
 * gets a home.
 *
 * The trigger is a render prop rather than a slot because the aria wiring is
 * the part that gets forgotten, and passing it as props that must be spread is
 * the only shape where forgetting it is visible at the call site.
 */
const POSITION = {
  below: "absolute top-[calc(100%+0.5rem)]",
  above: "absolute bottom-[calc(100%+0.5rem)] origin-bottom",
  inline: "relative mt-2 origin-top",
} as const;

export function Popover({
  trigger,
  children,
  label,
  align = "end",
  /**
   * `below` drops from the trigger, `above` rises from it (a trigger near the
   * bottom of a sheet), `inline` expands in flow and pushes content down
   * instead of covering it.
   */
  placement = "below",
  panelClassName = "w-72",
  /**
   * `menu` gives the panel role="menu" and roves the arrow keys across its
   * items, which is what a list of actions should do. `dialog` is for a panel
   * holding content rather than commands (a notification list, a filter form),
   * where arrow keys belong to the content.
   */
  role = "menu",
  onOpenChange,
}: {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "menu" | "dialog";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => ReactNode;
  children: (api: { close: () => void }) => ReactNode;
  /** Names the panel to a screen reader. Required: an unnamed panel is a blob. */
  label: string;
  align?: "start" | "end";
  placement?: "below" | "above" | "inline";
  panelClassName?: string;
  role?: "menu" | "dialog";
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /**
   * Whether the last close should hand focus back to the trigger.
   *
   * State rather than a ref, because `close` is handed to the panel's children
   * during render and a callback that writes a ref from there is exactly what
   * React's refs rule is about. It starts false so that mounting a closed
   * popover cannot pull focus out of whatever the page had focused.
   */
  const [restoreFocus, setRestoreFocus] = useState(false);

  const close = useCallback(
    (returnFocus = true) => {
      setRestoreFocus(returnFocus);
      setOpen(false);
      onOpenChange?.(false);
    },
    [onOpenChange]
  );

  /**
   * Escape and an explicit dismissal hand focus back to the trigger. An outside
   * click does not: the pointer already chose where focus should go, and
   * yanking it backwards fights that choice.
   */
  useEffect(() => {
    if (open || !restoreFocus) return;
    triggerRef.current?.focus();
  }, [open, restoreFocus]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    if (role === "menu") {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, role]);

  function onPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (role !== "menu") return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ].filter((item) => !item.hasAttribute("disabled"));
    if (items.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    const next =
      event.key === "Home"
        ? items[0]
        : event.key === "End"
          ? items[items.length - 1]
          : items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => {
          const next = !open;
          setOpen(next);
          onOpenChange?.(next);
        },
        "aria-haspopup": role,
        "aria-expanded": open,
        "aria-controls": panelId,
      })}

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role={role}
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          /* Opaque, not frosted. A translucent panel over a chart reads as a
             toy overlay; a solid card with a hairline reads as a menu. */
          className={`popover-panel ${POSITION[placement]} ${
            placement === "inline"
              ? ""
              : align === "end"
                ? "right-0 origin-top-right"
                : "left-0 origin-top-left"
          } ${panelClassName}`}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/UIProviders";

/** Apple-style account chip + popover: shows who's signed in and lets you
 * switch Google accounts or sign out without leaving the app. */
export function AccountMenu({
  displayName,
  email,
  role,
  roleLabel: customRoleLabel,
  placement = "bar",
}: {
  displayName: string;
  email: string;
  role: string;
  roleLabel?: string | null;
  /**
   * `bar` is the dashboard top bar: a compact chip whose panel drops down and
   * right-aligns. `sheet` is the mobile More sheet, `inline` expands in flow.
   *
   * There used to be a `side` variant for the sidebar footer, which anchored
   * the panel outside the aside at `left-[calc(100%+0.75rem)]`. The aside sets
   * `overflow-hidden`, so the panel was clipped and opening the menu looked
   * like it had eaten the navigation. The fix was to move the menu, not to
   * chase the clipping.
   */
  placement?: "bar" | "inline" | "sheet";
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = displayName.trim().charAt(0).toUpperCase() || "U";
  const roleLabel =
    customRoleLabel ??
    (role === "ADMIN" ? "Administrator" : role === "MANAGER" ? "Manager" : "Member");
  const compact = placement === "bar";
  const menuPosition =
    placement === "inline"
      ? "relative mt-2 w-full origin-top"
      : placement === "sheet"
        ? "absolute bottom-[calc(100%+0.5rem)] left-0 w-full origin-bottom"
        : "absolute right-0 top-[calc(100%+0.5rem)] w-72 max-w-[calc(100vw-2rem)] origin-top-right";

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
      .filter((item) => !item.disabled);
    if (items.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const target =
      event.key === "Home"
        ? items[0]
        : event.key === "End"
          ? items.at(-1)
          : items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    target?.focus();
  }

  async function switchAccount() {
    setBusy(true);
    try {
      const { signInWithGoogle, signOutGoogle } = await import("@/lib/firebase/client");
      await signOutGoogle();
      const idToken = await signInWithGoogle();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That account isn't allowed here.");
      }
      setOpen(false);
      router.push("/home");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not switch accounts.";
      // A cancelled Google popup isn't an error worth shouting about.
      if (!/popup|cancel|closed/i.test(msg)) toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      const { signOutGoogle } = await import("@/lib/firebase/client");
      await signOutGoogle();
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? "group flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-1.5 text-left transition hover:bg-surface-2"
            : "group flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-left transition hover:bg-surface-2"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${displayName} account menu. Switch account or sign out.`}
      >
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-sm bg-foreground text-xs font-semibold text-surface ${
            compact ? "h-7 w-7" : "h-8 w-8"
          }`}
        >
          {initial}
        </span>
        {/* The "Account" caption used to sit beside the name and squeezed both
            into ellipses at sidebar width. The chevron alone says it opens. */}
        <span className={compact ? "hidden min-w-0 max-w-36 lg:block" : "min-w-0 flex-1"}>
          <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
          {!compact && (
            <span className="block truncate text-xs text-muted">Switch or sign out</span>
          )}
        </span>
        <Icon
          name="chevronDown"
          size={15}
          className={`shrink-0 text-muted transition group-hover:text-foreground ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account actions"
          onKeyDown={handleMenuKeyDown}
          /* Opaque, not frosted. A translucent panel over a chart reads as a
             toy overlay; a solid card with a hairline reads as a menu. */
          className={`z-50 max-h-[calc(100dvh-2rem)] animate-rise overflow-y-auto rounded-lg border border-border bg-surface shadow-lg ${menuPosition}`}
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-foreground"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted">{email}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{roleLabel}</p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => void switchAccount()}
              disabled={busy}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition hover:bg-surface-2 disabled:opacity-50"
            >
              <Icon name="users" size={18} className="text-muted" />
              {busy ? "Opening Google…" : "Switch account"}
            </button>
            <button
              role="menuitem"
              onClick={() => void signOut()}
              disabled={busy}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-danger-soft disabled:opacity-50"
            >
              <Icon name="logOut" size={18} className="text-danger" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

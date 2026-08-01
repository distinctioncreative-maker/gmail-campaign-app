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
  placement = "side",
}: {
  displayName: string;
  email: string;
  role: string;
  placement?: "side" | "inline";
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = displayName.trim().charAt(0).toUpperCase() || "U";
  const roleLabel =
    role === "ADMIN" ? "Administrator" : role === "MANAGER" ? "Team Lead" : "Sales Rep";
  const menuPosition =
    placement === "inline"
      ? "relative mt-2 w-full origin-top"
      : "absolute bottom-0 left-[calc(100%+0.75rem)] w-72 origin-bottom-left";

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
        className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface/80 p-3 text-left shadow-sm transition hover:border-primary/25 hover:bg-surface"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${displayName} account menu. Switch account or sign out.`}
      >
        <span
          aria-hidden
          className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
          <span className="block truncate text-xs font-medium text-muted">Switch or sign out</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70 group-hover:text-foreground">
          Account
          <Icon name="chevronDown" size={15} className={`transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account actions"
          className={`glass z-50 max-h-[calc(100vh-2rem)] animate-rise overflow-y-auto rounded-xl border border-border shadow-lg ${menuPosition}`}
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span
              aria-hidden
              className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted">{email}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">{roleLabel}</p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => void switchAccount()}
              disabled={busy}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition hover:bg-surface-2 disabled:opacity-50"
            >
              <Icon name="users" size={18} className="text-muted/70" />
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

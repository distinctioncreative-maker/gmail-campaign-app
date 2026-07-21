"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/UIProviders";

/** Apple-style account chip + popover: shows who's signed in and lets you
 * switch Google accounts or sign out without leaving the app. */
export function AccountMenu({
  displayName,
  email,
  role,
}: {
  displayName: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = displayName.trim().charAt(0).toUpperCase() || "U";
  const roleLabel = role.replace("_", " ").toLowerCase();

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
      router.push("/sign-in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white/80 p-3 text-left transition hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          aria-hidden
          className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">{displayName}</span>
          <span className="block truncate text-xs capitalize text-slate-500">{roleLabel}</span>
        </span>
        <Icon name="chevronDown" size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="glass absolute bottom-full left-0 z-30 mb-2 w-64 origin-bottom animate-rise overflow-hidden rounded-2xl border border-border shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span
              aria-hidden
              className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => void switchAccount()}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Icon name="users" size={18} className="text-slate-400" />
              {busy ? "Opening Google…" : "Switch account"}
            </button>
            <button
              role="menuitem"
              onClick={() => void signOut()}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Icon name="external" size={18} className="text-red-400" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

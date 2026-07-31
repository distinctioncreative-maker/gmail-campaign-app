"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

interface State {
  testMode: boolean;
  mode: "TEST" | "LIVE";
  lockedByEnv: boolean;
}
interface ChecklistItem {
  ok: boolean;
  label: string;
}

export function SendingModeCard() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/sending-mode");
    if (res.ok) {
      const body = await res.json();
      setState(body.state);
      setChecklist(body.checklist);
    }
  }
  useEffect(() => {
    // State updates happen after the async fetch resolves, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function flip(mode: "TEST" | "LIVE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sending-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirm: mode === "LIVE" ? confirmText : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not change the mode.");
      setConfirmOpen(false);
      setConfirmText("");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the mode.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card p-6 text-sm text-muted">Loading…</div>;

  const live = state.mode === "LIVE";
  const allChecksPass = checklist.every((c) => c.ok);

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Sending mode</h2>
          <p className="mt-1 text-sm text-muted">
            Controls whether the whole team sends real email or safe test email.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            live ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {live ? "● LIVE: real emails" : "● TEST: safe mode"}
        </span>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {state.lockedByEnv && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          <Icon name="shield" size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>Sending is locked to test mode by the server configuration. The switch is
          disabled until that lock is cleared on the deployment.</p>
        </div>
      )}

      {!live ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-foreground">Before going live:</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className={`flex items-start gap-2 ${c.ok ? "text-foreground" : "text-amber-700"}`}>
                <Icon name={c.ok ? "check" : "alert"} size={16} className="mt-0.5 shrink-0" aria-hidden /> {c.label}
              </li>
            ))}
          </ul>

          {!confirmOpen ? (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={state.lockedByEnv || !allChecksPass}
              className="btn-primary mt-5 px-5 py-2.5 text-sm disabled:opacity-50"
              title={!allChecksPass ? "Complete the checklist first" : undefined}
            >
              Switch to real sending…
            </button>
          ) : (
            <div className="alert-danger mt-5 rounded-xl border p-4">
              <p className="text-sm font-medium text-danger">
                This turns on real emails for everyone on the team.
              </p>
              <p className="mt-1 text-sm text-muted">
                From this moment, campaigns send to actual recipients: not your test address.
                Type <strong>GO LIVE</strong> to confirm.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="GO LIVE"
                  className="w-40 rounded-xl border border-danger px-3 py-2 text-sm"
                />
                <button
                  onClick={() => flip("LIVE")}
                  disabled={busy || confirmText !== "GO LIVE"}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Switching…" : "Turn on real sending"}
                </button>
                <button
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmText("");
                  }}
                  className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <p className="rounded-lg bg-green-50 p-3 text-sm text-success">
            The team is sending real emails. New campaigns go to actual recipients.
          </p>
          <button
            onClick={() => flip("TEST")}
            disabled={busy}
            className="btn-ghost mt-4 px-5 py-2.5 text-sm"
          >
            {busy ? "Switching…" : "Switch back to test mode"}
          </button>
        </div>
      )}
    </div>
  );
}

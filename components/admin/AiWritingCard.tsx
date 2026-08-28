"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

interface State {
  enabled: boolean;
  keyConfigured: boolean;
}

/**
 * Admin master switch for all AI writing features (email writer, improve,
 * subject ideas, reply drafts, sequence drafting, per-lead openers). Off by
 * default: when off, none of the AI controls appear anywhere in the app.
 */
export function AiWritingCard() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/ai-writing");
    if (res.ok) setState(await res.json());
  }
  useEffect(() => {
    // State is set after the fetch resolves, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-writing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not change the setting.");
      }
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the setting.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card p-6 sm:p-7 text-sm text-muted">Loading…</div>;

  const on = state.enabled;

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">AI email writing</h2>
          <p className="mt-1 text-sm text-muted">
            The AI writer, improve tools, subject ideas, reply drafts, and sequence drafting.
            When off, none of these appear for anyone on the team.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            on ? "bg-success-soft text-success" : "bg-surface-2 text-muted"
          }`}
        >
          {on ? "● On" : "○ Off"}
        </span>
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      {!state.keyConfigured && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>No AI key is configured on the server yet, so turning this on won&apos;t enable AI
          until a <code className="rounded-sm bg-surface px-1">GEMINI_API_KEY</code> is set on the
          deployment.</p>
        </div>
      )}

      <div className="mt-5">
        {on ? (
          <button
            onClick={() => toggle(false)}
            disabled={busy}
            className="btn-ghost px-5 py-2.5 text-sm"
          >
            {busy ? "Saving…" : "Turn AI writing off"}
          </button>
        ) : (
          <button
            onClick={() => toggle(true)}
            disabled={busy}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Turn AI writing on"}
          </button>
        )}
      </div>
    </div>
  );
}

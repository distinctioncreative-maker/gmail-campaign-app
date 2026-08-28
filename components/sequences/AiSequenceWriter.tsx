"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

export interface GeneratedStep {
  waitDays: number;
  subject: string;
  html: string;
}

const IDEAS = [
  "A 3-step nudge for busy owners who didn't reply to a funding intro",
  "A gentle 2-step check-in for previous clients about a new round",
  "A polite final 'should I close your file?' follow-up sequence",
];

/**
 * "Draft the whole sequence with AI" for the follow-up builder. Turns one
 * prompt into 2-3 escalating steps. Hidden when the AI writer isn't set up.
 */
export function AiSequenceWriter({ onResult }: { onResult: (steps: GeneratedStep[]) => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<{ enabled: boolean }>("/api/sequences/generate")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function generate() {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ steps: GeneratedStep[] }>("/api/sequences/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      onResult(res.steps);
      toast(`Drafted ${res.steps.length} follow-up${res.steps.length === 1 ? "" : "s"}: edit to taste.`, "success");
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't draft that: try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-info/20 bg-info-soft/55">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={enabled === null}
          className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium text-info transition hover:bg-info-soft disabled:opacity-60"
        >
          <Icon name="sparkles" size={16} aria-hidden />
          Draft the whole sequence with AI
        </button>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-info">
            <Icon name="sparkles" size={16} aria-hidden /> Describe the follow-up sequence
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Three gentle nudges over two weeks for owners who didn't reply to a working-capital intro"
            className="mt-2 w-full rounded-md border border-info/20 bg-surface p-2.5 text-sm focus:border-info focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button
                key={i}
                onClick={() => setPrompt(i)}
                className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs text-muted hover:border-info"
              >
                {i}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void generate()}
              disabled={busy || prompt.trim().length < 3}
              className="btn-primary px-4 py-2 text-sm"
            >
              {busy ? "Drafting…" : "Draft it"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost px-3 py-2 text-sm">
              Close
            </button>
            <span className="text-xs text-muted">Replaces the steps below: you can still edit each.</span>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

const IDEAS = [
  "Friendly intro offering working capital to a restaurant owner",
  "Follow-up nudge for a busy contractor who hasn't replied",
  "Short note about fast funding for a trucking business",
];

/**
 * "Write with AI" panel for the template editor. Describes the email in plain
 * language; fills the subject + body. Hidden entirely when the AI writer
 * isn't configured on the server.
 */
export function AiEmailWriter({
  onResult,
}: {
  onResult: (email: { subject: string; html: string }) => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<{ enabled: boolean }>("/api/templates/generate")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function generate() {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    try {
      const email = await fetchJson<{ subject: string; html: string }>("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      onResult(email);
      toast("Draft written — tweak it to taste.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't write that — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) return null; // AI not set up → no clutter

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft/40">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={enabled === null}
          className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium text-primary transition hover:bg-primary-soft disabled:opacity-60"
        >
          <span aria-hidden className="text-base">✨</span>
          Write this email with AI
        </button>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span aria-hidden className="text-base">✨</span> Describe the email you want
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Warm first-touch offering fast working capital to a busy auto-repair shop owner"
            className="mt-2 w-full rounded-xl border border-primary/20 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button
                key={i}
                onClick={() => setPrompt(i)}
                className="rounded-full border border-primary/20 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-primary"
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
              {busy ? "Writing…" : "Write it"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost px-3 py-2 text-sm">
              Close
            </button>
            <span className="text-xs text-slate-400">Uses {"{{firstName}}"}, {"{{businessName}}"}, {"{{signature}}"}.</span>
          </div>
        </div>
      )}
    </div>
  );
}

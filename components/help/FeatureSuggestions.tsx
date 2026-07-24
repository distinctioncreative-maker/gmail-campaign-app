"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { LocalTime } from "@/components/LocalTime";

interface Suggestion {
  id: string;
  text: string;
  authorName: string;
  createdAt: number;
}

/**
 * A simple suggestion box: anyone on the team can propose a feature and see
 * what others have asked for. Ideas are shared org-wide.
 */
export function FeatureSuggestions() {
  const toast = useToast();
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<{ suggestions: Suggestion[] }>("/api/feature-suggestions")
      .then((r) => setItems(r.suggestions))
      .catch(() => setItems([]));
  }, []);

  async function submit() {
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ suggestion: Suggestion; message?: string }>(
        "/api/feature-suggestions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        }
      );
      setItems((prev) => [res.suggestion, ...(prev ?? [])]);
      setText("");
      toast(res.message ?? "Suggestion sent.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send that — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <p className="text-sm text-slate-600">
        Have an idea to make the app better? Suggest it — the team can see every idea here.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="e.g. Add a LinkedIn message step to sequences"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 3}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Sending…" : "Suggest it"}
        </button>
      </div>

      {items === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading ideas…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No suggestions yet — be the first.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((s) => (
            <li key={s.id} className="rounded-xl border border-border p-3">
              <p className="text-sm">{s.text}</p>
              <p className="mt-1 text-xs text-slate-400">
                {s.authorName} · <LocalTime value={s.createdAt} options={{ dateStyle: "medium" }} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

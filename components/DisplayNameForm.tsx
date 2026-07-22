"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

/** Edit how your name appears across the app (account menu, Team pages). */
export function DisplayNameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetchJson("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      toast("Name updated.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save your name.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="Your name"
        className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <button
        onClick={() => void save()}
        disabled={busy || !name.trim() || name.trim() === initial}
        className="btn-secondary px-4 py-2 text-sm"
      >
        {busy ? "Saving…" : "Save name"}
      </button>
    </div>
  );
}

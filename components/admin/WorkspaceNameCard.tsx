"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

/** Admin control to rename the workspace shown across the app. */
export function WorkspaceNameCard({ initial }: { initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>("/api/admin/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      toast(res.message ?? "Workspace renamed.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not rename the workspace.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium">Workspace name</h2>
      <p className="mt-1 text-sm text-slate-600">
        Your company&apos;s name, shown in the sidebar and on Home for everyone in this workspace —
        e.g. “Alpine Funding Partners” or “Everest Business Funding”.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Company name"
          className="w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => void save()}
          disabled={busy || !name.trim() || name.trim() === initial}
          className="btn-secondary px-4 py-2 text-sm"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

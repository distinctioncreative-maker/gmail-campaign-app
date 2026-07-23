"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

export interface LeadListChip {
  listId: string;
  name: string;
  count: number;
}

/** Row of lead lists on the Leads page, with inline "New list" creation. */
export function LeadListsBar({ lists }: { lists: LeadListChip[] }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ list: { listId: string }; message?: string }>("/api/lead-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      toast(res.message ?? "List created.", "success");
      setName("");
      setCreating(false);
      router.push(`/leads/lists/${res.list.listId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create the list.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Lead lists</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1.5 text-xs">
            + New list
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Named collections you keep topping up — paste more leads any time and duplicates are skipped
        automatically.
      </p>

      {creating && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="e.g. Alpine offers — all time"
            className="w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button onClick={() => void create()} disabled={busy || !name.trim()} className="btn-primary px-4 py-2 text-sm">
            Create
          </button>
          <button onClick={() => { setCreating(false); setName(""); }} className="btn-ghost px-3 py-2 text-sm">
            Cancel
          </button>
        </div>
      )}

      {lists.length === 0 ? (
        !creating && (
          <div className="card p-5 text-sm text-slate-500">
            No lists yet. Create one to keep an ever-growing collection like “Alpine offers — all time”.
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Link key={l.listId} href={`/leads/lists/${l.listId}`} className="card card-hover group flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate font-medium group-hover:text-primary">{l.name}</p>
                <p className="text-xs text-slate-500">{l.count.toLocaleString()} lead{l.count === 1 ? "" : "s"}</p>
              </div>
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon name="users" size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

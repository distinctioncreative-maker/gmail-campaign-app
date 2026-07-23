"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";

/** Rename / delete controls for a lead list's detail page. */
export function LeadListHeaderActions({ listId, name }: { listId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!value.trim() || value.trim() === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await fetchJson(`/api/lead-lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      toast("List renamed.", "success");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not rename.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: "The list is removed. Your leads are kept — they just leave this list.",
      danger: true,
      confirmLabel: "Delete list",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchJson(`/api/lead-lists/${listId}`, { method: "DELETE" });
      toast("List deleted.", "success");
      router.push("/leads");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete.", "error");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void rename()}
          className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button onClick={() => void rename()} disabled={busy} className="btn-primary px-3 py-2 text-sm">Save</button>
        <button onClick={() => { setEditing(false); setValue(name); }} className="btn-ghost px-3 py-2 text-sm">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditing(true)} className="btn-secondary px-4 py-2 text-sm">Rename</button>
      <button onClick={() => void remove()} disabled={busy} className="btn-ghost px-4 py-2 text-sm text-red-600">Delete</button>
    </div>
  );
}

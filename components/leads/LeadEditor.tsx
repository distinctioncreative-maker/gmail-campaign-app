"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";

interface LeadFields {
  fullName: string;
  businessName: string;
  phone: string;
  region: string;
  requestedAmount: number | null;
  leadSource: string;
  notes: string;
  emailOptOut: boolean;
}

/** Inline editor for a lead's details + notes, with opt-out and delete. */
export function LeadEditor({
  contactId,
  initial,
}: {
  contactId: string;
  initial: LeadFields;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LeadFields>(initial);

  function set<K extends keyof LeadFields>(key: K, value: LeadFields[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      await fetchJson(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      toast("Lead updated.", "success");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the lead.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleOptOut() {
    const next = !draft.emailOptOut;
    if (next) {
      const ok = await confirm({
        title: "Mark as Do Not Email?",
        body: "This lead will be excluded from every future campaign until you turn this off.",
        danger: true,
        confirmLabel: "Mark Do Not Email",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await fetchJson(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOptOut: next }),
      });
      set("emailOptOut", next);
      toast(next ? "Lead marked Do Not Email." : "Lead can be emailed again.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the lead.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this lead?",
      body: "The lead is removed from your list permanently. Past campaign emails and history are not affected.",
      danger: true,
      confirmLabel: "Delete lead",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchJson(`/api/contacts/${contactId}`, { method: "DELETE" });
      toast("Lead deleted.", "success");
      router.push("/leads");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the lead.", "error");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none";

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing(true)} className="btn-secondary px-4 py-2 text-sm">
          Edit lead
        </button>
        <button onClick={() => void toggleOptOut()} disabled={busy} className="btn-ghost px-4 py-2 text-sm">
          {draft.emailOptOut ? "Allow emailing again" : "Do Not Email"}
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="btn-ghost px-4 py-2 text-sm text-red-600"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="card mt-4 p-6">
      <h2 className="font-medium">Edit lead</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Full name</span>
          <input className={field} value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Business</span>
          <input className={field} value={draft.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Phone</span>
          <input className={field} value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Region</span>
          <input className={field} value={draft.region} onChange={(e) => set("region", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Requested amount ($)</span>
          <input
            className={field}
            type="number"
            min={0}
            value={draft.requestedAmount ?? ""}
            onChange={(e) =>
              set("requestedAmount", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Lead source</span>
          <input className={field} value={draft.leadSource} onChange={(e) => set("leadSource", e.target.value)} />
        </label>
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-slate-500">Notes (only you see these)</span>
        <textarea
          className={`${field} min-h-24`}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Call notes, context, next steps…"
        />
      </label>
      <p className="mt-2 text-xs text-slate-400">
        The email address can&apos;t be changed — it identifies this lead across imports and campaigns.
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={() => void save()} disabled={busy} className="btn-primary px-4 py-2 text-sm">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => {
            setDraft(initial);
            setEditing(false);
          }}
          disabled={busy}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

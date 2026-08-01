"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { normalizeContactTags } from "@/lib/leads/tags";

interface LeadFields {
  fullName: string;
  businessName: string;
  phone: string;
  region: string;
  requestedAmount: number | null;
  leadSource: string;
  notes: string;
  emailOptOut: boolean;
  tags: string[];
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
  const [tagInput, setTagInput] = useState(initial.tags.join(", "));

  function set<K extends keyof LeadFields>(key: K, value: LeadFields[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      await fetchJson(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          tags: normalizeContactTags(tagInput.split(",")),
        }),
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
    "min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none";

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing(true)} className="btn-secondary min-h-11 px-4 text-sm">
          Edit lead
        </button>
        <button onClick={() => void toggleOptOut()} disabled={busy} className="btn-ghost min-h-11 px-4 text-sm">
          {draft.emailOptOut ? "Allow emailing again" : "Do Not Email"}
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="btn-ghost min-h-11 px-4 text-sm text-danger hover:bg-danger-soft"
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
          <span className="mb-1 block text-muted">Full name</span>
          <input className={field} value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">Tags</span>
          <input
            className={field}
            value={tagInput}
            maxLength={679}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="Priority, Founder, Northeast"
          />
          <span className="mt-1 block text-xs text-muted">
            Separate tags with commas. Up to 20 tags, 32 characters each.
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Business</span>
          <input className={field} value={draft.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Phone</span>
          <input className={field} value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Region</span>
          <input className={field} value={draft.region} onChange={(e) => set("region", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Requested amount ($)</span>
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
          <span className="mb-1 block text-muted">Lead source</span>
          <input className={field} value={draft.leadSource} onChange={(e) => set("leadSource", e.target.value)} />
        </label>
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-muted">Notes (only you see these)</span>
        <textarea
          className={`${field} min-h-24`}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Call notes, context, next steps…"
        />
      </label>
      <p className="mt-2 text-xs text-muted/70">
        The email address can&apos;t be changed: it identifies this lead across imports and campaigns.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void save()} disabled={busy} className="btn-primary min-h-11 px-4 text-sm">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => {
            setDraft(initial);
            setTagInput(initial.tags.join(", "));
            setEditing(false);
          }}
          disabled={busy}
          className="btn-ghost min-h-11 px-4 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

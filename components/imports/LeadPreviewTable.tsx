"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { badgeFor, defaultSelection, type ClassifiedLead } from "./leadBadges";

export function LeadPreviewTable({
  leads,
  globalWarnings,
  onDone,
  onStartOver,
}: {
  leads: ClassifiedLead[];
  globalWarnings: string[];
  onDone: (summary: string) => void;
  onStartOver: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(() => defaultSelection(leads));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(index: number, selectable: boolean) {
    if (!selectable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function importSelected() {
    setBusy(true);
    setError(null);
    try {
      const chosen = leads.filter((l) => selected.has(l.index));
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: chosen.map(
            ({ classification: _c, lastCampaignName: _n, lastCampaignAt: _a, ...lead }) => lead
          ),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      onDone(
        `Imported ${body.imported} new contact${body.imported === 1 ? "" : "s"}` +
          (body.updated ? `, updated ${body.updated} existing` : "") +
          (body.skippedInvalid ? `, skipped ${body.skippedInvalid} without a valid email` : "") +
          "."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          {leads.length} lead{leads.length === 1 ? "" : "s"} found — {selected.size} selected
        </h2>
        <button onClick={onStartOver} className="text-sm text-slate-500 hover:underline">
          Start over
        </button>
      </div>

      {globalWarnings.map((w) => (
        <p key={w} className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          {w}
        </p>
      ))}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const badge = badgeFor(lead.classification);
              return (
                <tr key={lead.index} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Include ${lead.fullName || "lead " + (lead.index + 1)}`}
                      checked={selected.has(lead.index)}
                      disabled={!badge.selectable}
                      onChange={() => toggle(lead.index, badge.selectable)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{lead.fullName || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{lead.businessName || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{lead.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {lead.classification === "CONTACTED_BEFORE" && lead.lastCampaignAt
                      ? `Last contacted ${new Date(lead.lastCampaignAt).toLocaleDateString()}`
                      : lead.warnings.slice(0, 2).join("; ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={importSelected}
        disabled={busy || selected.size === 0}
        className="mt-5 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {busy
          ? "Importing…"
          : `Continue with ${selected.size} selected lead${selected.size === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

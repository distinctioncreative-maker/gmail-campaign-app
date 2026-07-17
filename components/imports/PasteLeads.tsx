"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedLead } from "@/schemas/parsedLead";

type ClassifiedLead = ParsedLead & {
  classification: string;
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
};

const BADGES: Record<string, { label: string; className: string; selectable: boolean }> = {
  NEW: { label: "Ready", className: "bg-green-100 text-green-700", selectable: true },
  EXISTING_NOT_CONTACTED: { label: "Ready", className: "bg-green-100 text-green-700", selectable: true },
  CONTACTED_BEFORE: { label: "Used before", className: "bg-blue-100 text-blue-700", selectable: true },
  REPLIED_BEFORE: { label: "Replied before", className: "bg-blue-100 text-blue-700", selectable: true },
  INVALID: { label: "Missing email", className: "bg-red-100 text-red-700", selectable: false },
  EMAIL_OPT_OUT: { label: "Opted out", className: "bg-amber-100 text-amber-700", selectable: false },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-amber-100 text-amber-700", selectable: false },
  BOUNCED: { label: "Bounced before", className: "bg-amber-100 text-amber-700", selectable: false },
  SUPPRESSED: { label: "Excluded for safety", className: "bg-amber-100 text-amber-700", selectable: false },
};

function badgeFor(classification: string) {
  return (
    BADGES[classification] ?? {
      label: classification,
      className: "bg-slate-100 text-slate-600",
      selectable: false,
    }
  );
}

export function PasteLeads() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [leads, setLeads] = useState<ClassifiedLead[] | null>(null);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  async function preview() {
    setBusy(true);
    setError(null);
    setImportSummary(null);
    try {
      const res = await fetch("/api/leads/parse-salesforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not read that list.");
      setLeads(body.leads);
      setGlobalWarnings(body.globalWarnings);
      // Pre-select only safe leads; previously contacted leads require an
      // explicit opt-in.
      setSelected(
        new Set(
          (body.leads as ClassifiedLead[])
            .filter(
              (l) =>
                badgeFor(l.classification).selectable &&
                l.classification !== "CONTACTED_BEFORE" &&
                l.classification !== "REPLIED_BEFORE"
            )
            .map((l) => l.index)
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that list.");
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    if (!leads) return;
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
      setImportSummary(
        `Imported ${body.imported} new contact${body.imported === 1 ? "" : "s"}` +
          (body.updated ? `, updated ${body.updated} existing` : "") +
          (body.skippedInvalid ? `, skipped ${body.skippedInvalid} without a valid email` : "") +
          "."
      );
      setLeads(null);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number, selectable: boolean) {
    if (!selectable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {importSummary && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{importSummary}</p>
      )}

      {!leads && (
        <>
          <label htmlFor="paste-box" className="block text-sm font-medium text-slate-700">
            Paste your Salesforce lead list
          </label>
          <textarea
            id="paste-box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Select Item 1\nJason Main\nMainmastics Llc\n…"}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={preview}
            disabled={busy || text.trim().length === 0}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Reading…" : "Preview leads"}
          </button>
        </>
      )}

      {leads && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {leads.length} lead{leads.length === 1 ? "" : "s"} found — {selected.size} selected
            </h2>
            <button onClick={() => setLeads(null)} className="text-sm text-slate-500 hover:underline">
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
            {busy ? "Importing…" : `Continue with ${selected.size} selected lead${selected.size === 1 ? "" : "s"}`}
          </button>
        </>
      )}

      {!leads && error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

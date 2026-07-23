"use client";

import { useState } from "react";
import { LeadPreviewTable } from "./LeadPreviewTable";
import type { ClassifiedLead } from "./leadBadges";

export function PasteLeads({ listId }: { listId?: string }) {
  const [text, setText] = useState("");
  const [leads, setLeads] = useState<ClassifiedLead[] | null>(null);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
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
      if (!body.leads || body.leads.length === 0) {
        // Don't switch to an empty preview table — keep the paste box and
        // explain what to try instead.
        setError(
          body.globalWarnings?.[0] ??
            "We couldn’t find any leads in that text. Paste the list straight from Salesforce and try again."
        );
        return;
      }
      setLeads(body.leads);
      setGlobalWarnings(body.globalWarnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      {importSummary && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{importSummary}</p>
      )}

      {!leads ? (
        <>
          <label htmlFor="paste-box" className="block text-sm font-medium text-slate-700">
            Paste your Salesforce lead list
          </label>
          <p className="mt-1 text-sm text-slate-500">
            Copy your leads straight out of Salesforce and paste them here — either
            format works: the list view with columns (First Name, Last Name, Email…)
            or the row-by-row layout that starts each lead with “Select Item”. We’ll
            figure out the columns for you.
          </p>
          <textarea
            id="paste-box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={
              "Paste from Salesforce here.\n\nWorks with the column list view:\nFirst Name  Last Name  Email  Phone …\n1  Jason  Main  jason@example.com …\n\nor the row layout:\nSelect Item 1\nJason Main\nMainmastics Llc\n…"
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={preview}
            disabled={busy || text.trim().length === 0}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Reading…" : "Preview leads"}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </>
      ) : (
        <LeadPreviewTable
          leads={leads}
          globalWarnings={globalWarnings}
          listId={listId}
          onDone={(summary) => {
            setImportSummary(summary);
            setLeads(null);
            setText("");
          }}
          onStartOver={() => setLeads(null)}
        />
      )}
    </div>
  );
}

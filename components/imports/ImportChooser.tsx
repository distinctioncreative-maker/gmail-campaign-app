"use client";

import { useState } from "react";
import { PasteLeads } from "./PasteLeads";
import { CsvUpload } from "./CsvUpload";

type Mode = "paste" | "csv" | null;

export function ImportChooser({ listId }: { listId?: string }) {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "paste" || mode === "csv") {
    return (
      <div>
        <button
          onClick={() => setMode(null)}
          className="mb-3 text-sm text-slate-500 hover:underline"
        >
          ← Choose a different import method
        </button>
        {mode === "paste" ? <PasteLeads listId={listId} /> : <CsvUpload listId={listId} />}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <button
        onClick={() => setMode("csv")}
        className="rounded-2xl bg-white p-6 text-left shadow-sm transition hover:shadow-md"
      >
        <p className="text-2xl">📄</p>
        <p className="mt-2 font-medium">Upload CSV <span className="align-middle text-[10px] font-semibold uppercase tracking-wide text-green-600">Recommended</span></p>
        <p className="mt-1 text-sm text-slate-500">
          Export from Salesforce as CSV and drop it here — the most reliable, keeps every column
        </p>
      </button>
      <button
        onClick={() => setMode("paste")}
        className="rounded-2xl bg-white p-6 text-left shadow-sm transition hover:shadow-md"
      >
        <p className="text-2xl">📋</p>
        <p className="mt-2 font-medium">Paste leads</p>
        <p className="mt-1 text-sm text-slate-500">
          Copy rows straight from a Salesforce list view — we match leads by email automatically
        </p>
      </button>
      <div className="rounded-2xl bg-white p-6 opacity-60 shadow-sm">
        <p className="text-2xl">⚡</p>
        <p className="mt-2 font-medium">Salesforce Lightning sync</p>
        <p className="mt-1 text-sm text-slate-500">
          One-click connect to pull leads directly — <span className="font-medium text-primary">coming soon</span>
        </p>
      </div>
      <div className="rounded-2xl bg-white p-6 opacity-60 shadow-sm">
        <p className="text-2xl">📊</p>
        <p className="mt-2 font-medium">Import Google Sheet</p>
        <p className="mt-1 text-sm text-slate-500">Coming soon</p>
      </div>
    </div>
  );
}

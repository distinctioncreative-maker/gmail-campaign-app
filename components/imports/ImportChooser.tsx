"use client";

import { useState } from "react";
import { PasteLeads } from "./PasteLeads";
import { CsvUpload } from "./CsvUpload";
import { Icon, type IconName } from "@/components/ui/Icon";

type Mode = "paste" | "csv" | null;

function ImportIcon({ name }: { name: IconName }) {
  return <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-foreground"><Icon name={name} size={20} /></span>;
}

export function ImportChooser({ listId }: { listId?: string }) {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "paste" || mode === "csv") {
    return (
      <div>
        <button
          onClick={() => setMode(null)}
          className="mb-3 text-sm text-muted hover:underline"
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
        className="card p-6 sm:p-7 card-hover text-left"
      >
        <ImportIcon name="download" />
        <p className="mt-2 font-medium">Upload CSV <span className="align-middle text-3xs font-semibold uppercase tracking-wide text-success">Recommended</span></p>
        <p className="mt-1 text-sm text-muted">
          Export from Salesforce as CSV and drop it here: the most reliable, keeps every column
        </p>
      </button>
      <button
        onClick={() => setMode("paste")}
        className="card p-6 sm:p-7 card-hover text-left"
      >
        <ImportIcon name="copy" />
        <p className="mt-2 font-medium">Paste leads</p>
        <p className="mt-1 text-sm text-muted">
          Copy rows straight from a Salesforce list view: we match leads by email automatically
        </p>
      </button>
      <div className="card p-6 sm:p-7 opacity-60">
        <ImportIcon name="external" />
        <p className="mt-2 font-medium">Salesforce Lightning sync</p>
        <p className="mt-1 text-sm text-muted">
          One-click connect to pull leads directly: <span className="font-medium text-foreground">coming soon</span>
        </p>
      </div>
      <div className="card p-6 sm:p-7 opacity-60">
        <ImportIcon name="chart" />
        <p className="mt-2 font-medium">Import Google Sheet</p>
        <p className="mt-1 text-sm text-muted">Coming soon</p>
      </div>
    </div>
  );
}

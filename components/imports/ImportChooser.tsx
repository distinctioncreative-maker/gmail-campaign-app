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
    /* Two more cards used to sit here, dimmed, promising a Salesforce Lightning
       sync and a Google Sheets import. Neither existed. The Sheets one was at
       least on the roadmap; the Salesforce one had no registry entry and no code
       anywhere in the repo. Advertising vapour on a screen a paying customer
       uses weekly is the fastest way to make everything else on it look like a
       claim too. They come back when they work. */
    <div className="grid gap-4 sm:grid-cols-2">
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
    </div>
  );
}

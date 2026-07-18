"use client";

import { useRef, useState } from "react";
import { LeadPreviewTable } from "./LeadPreviewTable";
import type { ClassifiedLead } from "./leadBadges";

const FIELD_LABELS: Record<string, string> = {
  ignore: "— Skip this column —",
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  businessName: "Business",
  email: "Email",
  phone: "Phone",
  region: "Region",
  requestedAmount: "Amount",
  leadSource: "Lead source",
  sourceCreatedAt: "Created date",
  sourceUpdatedAt: "Updated date",
  sourceRecordId: "Record ID",
  emailOptOut: "Email opt out",
};

interface CsvState {
  csvText: string;
  headers: string[];
  mapping: Record<string, string>;
  fields: string[];
  leads: ClassifiedLead[];
  globalWarnings: string[];
}

export function CsvUpload() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CsvState | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  async function parse(csvText: string, mapping?: Record<string, string>, saveMapping = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/parse-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, mapping, saveMapping }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not read that file.");
      setState({ csvText, ...body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setImportSummary(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Please choose a .csv file.");
      return;
    }
    await parse(await file.text());
  }

  function updateMapping(header: string, field: string) {
    if (!state) return;
    const mapping = { ...state.mapping, [header]: field };
    void parse(state.csvText, mapping, true);
  }

  return (
    <div className="card p-6">
      {importSummary && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{importSummary}</p>
      )}

      {!state ? (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver ? "border-primary bg-blue-50" : "border-slate-300"
            }`}
          >
            <p className="font-medium text-slate-700">
              {busy ? "Reading file…" : "Drag a CSV file here, or click to choose"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              The first row should contain column names
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">
              Columns matched automatically.{" "}
              <button
                onClick={() => setShowMapping((s) => !s)}
                className="font-medium text-primary hover:underline"
              >
                {showMapping ? "Hide column matching" : "Check column matching"}
              </button>
            </p>
          </div>

          {showMapping && (
            <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
              {state.headers.map((header) => (
                <label key={header} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-slate-700">{header}</span>
                  <select
                    value={state.mapping[header] ?? "ignore"}
                    onChange={(e) => updateMapping(header, e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  >
                    {state.fields.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f] ?? f}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <LeadPreviewTable
            leads={state.leads}
            globalWarnings={state.globalWarnings}
            onDone={(summary) => {
              setImportSummary(summary);
              setState(null);
            }}
            onStartOver={() => setState(null)}
          />
        </>
      )}
    </div>
  );
}

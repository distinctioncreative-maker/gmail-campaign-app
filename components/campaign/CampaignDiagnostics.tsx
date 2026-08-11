"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

interface Check {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}
interface Diagnosis {
  overall: "ok" | "warn" | "fail";
  checks: Check[];
  errorSamples: string[];
}

const MARK: Record<Check["status"], { icon: string; className: string }> = {
  ok: { icon: "✓", className: "bg-success-soft text-success" },
  warn: { icon: "!", className: "bg-warning-soft text-warning" },
  fail: { icon: "✕", className: "bg-danger-soft text-danger" },
};

export function CampaignDiagnostics({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Diagnosis | null>(null);

  async function run() {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      setData(await fetchJson<Diagnosis>(`/api/campaigns/${campaignId}/diagnose`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the check.");
    } finally {
      setBusy(false);
    }
  }

  const summary =
    data?.overall === "ok"
      ? "Everything looks healthy."
      : data?.overall === "warn"
        ? "A few things to be aware of."
        : "Found problems that stop sending.";

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Diagnose this campaign</p>
          <p className="text-xs text-muted">
            Plain-language checks for “why aren’t my emails sending?”
          </p>
        </div>
        <button onClick={run} disabled={busy} className="btn-ghost px-4 py-2 text-sm">
          {busy ? "Checking…" : data ? "Re-run" : "Run check"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-soft p-2 text-sm text-danger">{error}</p>}

      {open && data && (
        <div className="mt-4">
          <p
            className={`mb-3 rounded-lg p-2 text-sm font-medium ${
              data.overall === "ok"
                ? "bg-success-soft text-success"
                : data.overall === "warn"
                  ? "bg-warning-soft text-warning"
                  : "bg-danger-soft text-danger"
            }`}
          >
            {summary}
          </p>
          <ul className="space-y-2">
            {data.checks.map((c) => {
              const m = MARK[c.status];
              return (
                <li key={c.label} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.className}`}
                  >
                    {m.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-sm text-muted">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          {data.errorSamples.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold text-muted">Recent error messages</p>
              <ul className="mt-1 space-y-1">
                {data.errorSamples.map((e, i) => (
                  <li key={i} className="font-mono text-xs text-muted">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  badgeFor,
  defaultSelection,
  isSelectable,
  VERDICT_BADGES,
  type ClassifiedLead,
} from "./leadBadges";
import { batchLeadImport } from "@/lib/leads/importBatching";
import { DataTable } from "@/components/ui/DataTable";
import { ConsentPicker } from "./ConsentPicker";
import { DEFAULT_CONSENT_BASIS, type ConsentBasis } from "@/lib/compliance/consent";

export function LeadPreviewTable({
  leads,
  globalWarnings,
  listId,
  onDone,
  onStartOver,
}: {
  leads: ClassifiedLead[];
  globalWarnings: string[];
  listId?: string;
  onDone: (summary: string) => void;
  onStartOver: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(() => defaultSelection(leads));
  const verificationCounts = leads.some((l) => l.verification)
    ? {
        deliverable: leads.filter((l) => l.verification?.verdict === "DELIVERABLE").length,
        unconfirmable: leads.filter((l) => l.verification?.verdict === "UNCONFIRMABLE").length,
        risky: leads.filter((l) => l.verification?.verdict === "RISKY").length,
        undeliverable: leads.filter((l) => l.verification?.verdict === "UNDELIVERABLE").length,
      }
    : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [consentBasis, setConsentBasis] = useState<ConsentBasis>(DEFAULT_CONSENT_BASIS);
  const [consentNote, setConsentNote] = useState("");

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
      const prepared = chosen.map(
        ({ classification: _c, lastCampaignName: _n, lastCampaignAt: _a, ...lead }) => lead
      );
      const batches = batchLeadImport(prepared);
      const totals = {
        imported: 0,
        updated: 0,
        skippedInvalid: 0,
        optOuts: 0,
        addedToList: 0,
        alreadyInList: 0,
        listName: null as string | null,
      };
      setProgress({ completed: 0, total: batches.length });
      for (let index = 0; index < batches.length; index++) {
        const res = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: batches[index],
            ...(listId ? { listId } : {}),
            // Sent with every batch: a large file becomes several requests and
            // each one must carry the same declaration, or the tail of a list
            // lands with no recorded basis.
            consentBasis,
            consentNote,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Import batch ${index + 1} failed.`);
        totals.imported += body.imported ?? 0;
        totals.updated += body.updated ?? 0;
        totals.skippedInvalid += body.skippedInvalid ?? 0;
        totals.optOuts += body.optOuts ?? 0;
        totals.addedToList += body.addedToList ?? 0;
        totals.alreadyInList += body.alreadyInList ?? 0;
        totals.listName = body.listName ?? totals.listName;
        setProgress({ completed: index + 1, total: batches.length });
      }
      onDone(
        listId
          ? `Added ${totals.addedToList} new lead${totals.addedToList === 1 ? "" : "s"} to “${totals.listName}”` +
              (totals.alreadyInList ? ` (${totals.alreadyInList} already in the list)` : "") +
              "."
          : `Imported ${totals.imported} new contact${totals.imported === 1 ? "" : "s"}` +
              (totals.updated ? `, updated ${totals.updated} existing` : "") +
              (totals.skippedInvalid ? `, skipped ${totals.skippedInvalid} without a valid email` : "") +
              "."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          {leads.length} lead{leads.length === 1 ? "" : "s"} found: {selected.size} selected
        </h2>
        <button onClick={onStartOver} className="text-sm text-muted hover:underline">
          Start over
        </button>
      </div>

      {globalWarnings.map((w) => (
        <p key={w} className="mt-2 rounded-lg bg-warning-soft p-2 text-xs text-warning">
          {w}
        </p>
      ))}

      {/* Checked before anything is saved, so a dead domain or a typo is
          something you see now rather than a bounce next week. */}
      {verificationCounts && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-foreground">Address check:</span>
          <span className="badge bg-success-soft text-success">
            {verificationCounts.deliverable} checked
          </span>
          {verificationCounts.unconfirmable > 0 && (
            <span className="badge bg-surface-2 text-muted">
              {verificationCounts.unconfirmable} cannot confirm
            </span>
          )}
          {verificationCounts.risky > 0 && (
            <span className="badge bg-warning-soft text-warning">
              {verificationCounts.risky} risky
            </span>
          )}
          {verificationCounts.undeliverable > 0 && (
            <span className="badge bg-danger-soft text-danger">
              {verificationCounts.undeliverable} undeliverable
            </span>
          )}
          <span className="text-muted">
            Undeliverable rows cannot be imported. Risky ones are left unticked. Cannot confirm
            means the domain accepts every address, so no check can prove that mailbox exists.
          </span>
        </div>
      )}

      <DataTable className="mt-4"
        head={<>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
            </>}
      >
            {leads.map((lead) => {
              const badge = badgeFor(lead.classification);
              const selectable = isSelectable(lead);
              const verdict = lead.verification
                ? VERDICT_BADGES[lead.verification.verdict]
                : null;
              return (
                <tr key={lead.index} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Include ${lead.fullName || "lead " + (lead.index + 1)}`}
                      checked={selected.has(lead.index)}
                      disabled={!selectable}
                      onChange={() => toggle(lead.index, selectable)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{lead.fullName || "Not available"}</td>
                  <td className="px-3 py-2 text-muted">{lead.businessName || "Not available"}</td>
                  <td className="px-3 py-2 text-muted">{lead.email ?? "Not available"}</td>
                  <td className="px-3 py-2">
                    {verdict && (
                      <span className={`badge ${verdict.className}`}>{verdict.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {lead.verification && lead.verification.findings.length > 0
                      ? lead.verification.findings.map((f) => f.detail).join(" ")
                      : lead.classification === "CONTACTED_BEFORE" && lead.lastCampaignAt
                        ? `Last contacted ${new Date(lead.lastCampaignAt).toLocaleDateString()}`
                        : lead.warnings.slice(0, 2).join("; ")}
                  </td>
                </tr>
              );
            })}
          </DataTable>

      <ConsentPicker
        value={consentBasis}
        note={consentNote}
        onChange={setConsentBasis}
        onNoteChange={setConsentNote}
      />

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button
        onClick={importSelected}
        disabled={busy || selected.size === 0}
        className="mt-5 btn-primary px-5 py-2.5"
      >
        {busy
          ? progress
            ? `Importing batch ${Math.min(progress.completed + 1, progress.total)} of ${progress.total}…`
            : "Preparing import…"
          : `Continue with ${selected.size} selected lead${selected.size === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

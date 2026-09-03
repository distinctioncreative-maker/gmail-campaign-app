"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  badgeFor,
  defaultSelection,
  isSelectable,
  VERDICT_BADGES,
  type ClassifiedLead,
} from "./leadBadges";
import { batchLeadImport } from "@/lib/leads/importBatching";
import { DataTable, TableRow } from "@/components/ui/DataTable";
import { ConsentPicker } from "./ConsentPicker";
import { DEFAULT_CONSENT_BASIS, type ConsentBasis } from "@/lib/compliance/consent";

/**
 * How many rows are painted at once.
 *
 * Not virtualization, deliberately: with search and verdict filters in place
 * the realistic working set is small, and a windowing library would be a
 * dependency plus a scroll-restoration problem for a table people spend
 * seconds in. The cap exists so a ten-thousand row paste cannot lock the tab,
 * and the footer says plainly when it is in effect.
 */
const RENDER_STEP = 200;

export function LeadPreviewTable({
  leads,
  globalWarnings,
  listId,
  ignoreFileOptOut = false,
  optOutOverrideReason = "",
  onDone,
  onStartOver,
}: {
  leads: ClassifiedLead[];
  globalWarnings: string[];
  listId?: string;
  /** Decided above this component, on the file as a whole. See OptOutColumnChoice. */
  ignoreFileOptOut?: boolean;
  optOutOverrideReason?: string;
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
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(RENDER_STEP);

  /**
   * The rows currently on screen.
   *
   * This is the whole fix. The table used to render every parsed row with no
   * filter and no cap, so including the risky addresses out of a two-thousand
   * row import meant scrolling the entire list hunting for amber pills and
   * ticking them one at a time. The counts above the table already knew which
   * rows those were; they were just printed as static text.
   *
   * Filtering happens before the cap, so narrowing to a verdict always shows
   * that whole set rather than whatever survived the first N rows.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (verdictFilter && (lead.verification?.verdict ?? "NONE") !== verdictFilter) {
        return false;
      }
      if (!q) return true;
      return (
        lead.fullName.toLowerCase().includes(q) ||
        lead.businessName.toLowerCase().includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, query, verdictFilter]);

  const rendered = visible.slice(0, shown);
  const selectableVisible = visible.filter(isSelectable);
  const allShownSelected =
    selectableVisible.length > 0 && selectableVisible.every((l) => selected.has(l.index));

  function setFilter(verdict: string | null) {
    setVerdictFilter((current) => (current === verdict ? null : verdict));
    // Reset the cap: a narrowed list is usually short enough to show whole, and
    // carrying a stale offset would hide rows the filter just surfaced.
    setShown(RENDER_STEP);
  }

  /** Tick or untick every row currently passing the filter. */
  function toggleShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const lead of selectableVisible) {
        if (allShownSelected) next.delete(lead.index);
        else next.add(lead.index);
      }
      return next;
    });
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
            // Same reasoning as the consent declaration above: a large file is
            // several requests, and every one of them has to carry the same
            // decision or the tail of the list gets the default instead.
            ignoreFileOptOut,
            optOutOverrideReason,
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
        <h2>
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

      {/* The counts are the filter.
          They were static text before, which is the odd part: the strip already
          knew exactly which rows were risky and printed the number, while the
          only way to act on that set was to scroll the whole table hunting for
          amber pills. Pressing a count now narrows to it, and "Select all
          shown" ticks the lot, so including twelve risky addresses is two
          clicks instead of twelve finds. */}
      {verificationCounts && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-foreground">Address check:</span>
          {(
            [
              ["DELIVERABLE", verificationCounts.deliverable, "checked", "bg-success-soft text-success"],
              ["UNCONFIRMABLE", verificationCounts.unconfirmable, "cannot confirm", "bg-surface-2 text-muted"],
              ["RISKY", verificationCounts.risky, "risky", "bg-warning-soft text-warning"],
              ["UNDELIVERABLE", verificationCounts.undeliverable, "undeliverable", "bg-danger-soft text-danger"],
            ] as const
          )
            .filter(([, count]) => count > 0)
            .map(([verdict, count, label, className]) => {
              const active = verdictFilter === verdict;
              return (
                <button
                  key={verdict}
                  type="button"
                  onClick={() => setFilter(verdict)}
                  aria-pressed={active}
                  className={`badge transition-colors duration-(--dur-fast) ${className} ${
                    active ? "ring-2 ring-ring" : "hover:brightness-95"
                  }`}
                >
                  {count} {label}
                </button>
              );
            })}
          {verdictFilter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-muted link hover:text-foreground"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
      {verificationCounts && (
        <p className="mt-1.5 text-xs text-muted">
          Undeliverable rows cannot be imported. Risky ones start unticked. Cannot confirm
          means the domain accepts every address, so no check can prove that mailbox exists.
        </p>
      )}

      {/* Search and bulk selection. The wizard's lead picker has had both for a
          while; this table did the same job without either. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(RENDER_STEP);
          }}
          placeholder="Search name, business or email"
          className="min-w-0 flex-1 px-3 py-1.5"
        />
        <button
          type="button"
          onClick={toggleShown}
          disabled={selectableVisible.length === 0}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          {allShownSelected ? "Clear shown" : `Select all shown (${selectableVisible.length})`}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Showing {visible.length.toLocaleString()} of {leads.length.toLocaleString()} ·{" "}
        {selected.size.toLocaleString()} selected
      </p>

      <DataTable className="mt-3 max-h-[32rem] overflow-y-auto"
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
            {rendered.map((lead) => {
              const badge = badgeFor(lead.classification);
              const selectable = isSelectable(lead);
              const verdict = lead.verification
                ? VERDICT_BADGES[lead.verification.verdict]
                : null;
              return (
                <TableRow key={lead.index} interactive={false}>
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
                    {/* One badge shape. This column used `.badge` (6px) while
                        the Address column beside it used a full pill, so two
                        differently-shaped status chips sat in adjacent cells of
                        the same row. */}
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {lead.verification && lead.verification.findings.length > 0
                      ? lead.verification.findings.map((f) => f.detail).join(" ")
                      : lead.classification === "CONTACTED_BEFORE" && lead.lastCampaignAt
                        ? `Last contacted ${new Date(lead.lastCampaignAt).toLocaleDateString()}`
                        : lead.warnings.slice(0, 2).join("; ")}
                  </td>
                </TableRow>
              );
            })}
          </DataTable>

      {visible.length > rendered.length && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShown((n) => n + RENDER_STEP)}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Show {Math.min(RENDER_STEP, visible.length - rendered.length)} more
          </button>
          <span className="text-xs text-muted">
            {rendered.length.toLocaleString()} of {visible.length.toLocaleString()} rows drawn.
            Selecting all shown applies to every row that passes the filter, not just the
            drawn ones.
          </span>
        </div>
      )}

      {visible.length === 0 && (
        <p className="mt-4 rounded-lg border border-border p-4 text-center text-sm text-muted">
          No leads match that search or filter.
        </p>
      )}

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

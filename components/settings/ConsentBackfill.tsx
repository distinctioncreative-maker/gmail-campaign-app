"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONSENT_BASIS_COPY,
  DEFAULT_CONSENT_BASIS,
  SELECTABLE_CONSENT_BASES,
  type ConsentBasis,
} from "@/lib/compliance/consent";

/**
 * Answer "where did these come from?" once, for a backlog imported before the
 * question was asked.
 *
 * The sweep runs as a cursor loop rather than one request because the contacts
 * needing an answer cannot be queried for directly: a document written before
 * the field existed does not hold it, and a missing field matches no filter, so
 * finding them means reading pages and checking each one. Doing that in a single
 * request would time out on the workspaces with the largest backlogs, which are
 * exactly the ones that need it.
 */
export function ConsentBackfill({ unrecorded }: { unrecorded: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<ConsentBasis>(DEFAULT_CONSENT_BASIS);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      let cursor: string | null = null;
      let updated = 0;
      // Bounded so a bug upstream cannot spin here forever. At 200 contacts a
      // page this covers 200k, far past where the sweep is the right tool.
      for (let page = 0; page < 1000; page++) {
        const res: Response = await fetch("/api/leads/consent-basis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ basis, cursor }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not save that.");
        updated += body.updated ?? 0;
        cursor = body.cursor;
        if (body.done) break;
      }
      setDone(updated);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <p className="mt-2 text-xs text-success">
        Recorded for {done.toLocaleString()} lead{done === 1 ? "" : "s"}.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
      >
        Record it for all {unrecorded.toLocaleString()}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="text-xs text-muted">
        Applies only to leads with nothing recorded. Anything already answered stays as it is.
      </p>
      <div className="mt-2 grid gap-1.5">
        {SELECTABLE_CONSENT_BASES.map((option) => (
          <label key={option} className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="radio"
              name="backfill-basis"
              checked={basis === option}
              onChange={() => setBasis(option)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">
                {CONSENT_BASIS_COPY[option].label}
              </span>
              <span className="block text-muted">{CONSENT_BASIS_COPY[option].example}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Saving…" : "Save for all"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-xs text-muted hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { LocalTime } from "@/components/LocalTime";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  auditCategory,
  auditLabel,
  auditWeight,
  AUDIT_CATEGORIES,
  CATEGORY_LABELS,
  allAuditActions,
  type AuditCategory,
} from "@/lib/audit/actions";

/**
 * The audit trail, read-only.
 *
 * Filtering happens on the client across the loaded pages rather than by
 * refetching per category. The alternative needs a composite index per
 * category and a round trip per click, and the log is read by an admin
 * answering one question, not browsed continuously. The one filter that does go
 * to the server is a single action, because that is the one someone arrives with
 * ("show me every time the sending mode changed") and it has to see the whole
 * log rather than the pages already loaded.
 */

interface Entry {
  entryId: string;
  action: string;
  actorEmail: string;
  subject: string;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  at: number;
}

const WEIGHT_DOT: Record<string, string> = {
  CRITICAL: "bg-danger",
  NOTABLE: "bg-warning",
  ROUTINE: "bg-border",
};

export function AuditLogList() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [category, setCategory] = useState<AuditCategory | "ALL">("ALL");
  const [action, setAction] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (before: number | null, replace: boolean, forAction: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (before) params.set("before", String(before));
        if (forAction) params.set("action", forAction);
        const res = await fetchJson<{ entries: Entry[]; cursor: number | null }>(
          `/api/admin/audit?${params.toString()}`
        );
        setEntries((prev) => (replace || prev === null ? res.entries : [...prev, ...res.entries]));
        setCursor(res.cursor);
        setFailed(false);
      } catch {
        setFailed(true);
        setEntries((prev) => prev ?? []);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null, true, "");
  }, [load]);

  function changeAction(next: string) {
    setAction(next);
    // A server-side filter changes what the log contains, so the loaded pages
    // and the cursor are no longer about the same query.
    setCategory("ALL");
    setEntries(null);
    setCursor(null);
    void load(null, true, next);
  }

  if (entries === null) {
    return <p className="mt-6 text-sm text-muted">Loading…</p>;
  }

  const visible =
    category === "ALL" ? entries : entries.filter((e) => auditCategory(e.action) === category);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => changeAction(e.target.value)}
          aria-label="Filter by action"
          className="rounded-md border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Every action</option>
          {allAuditActions().map((a) => (
            <option key={a} value={a}>
              {auditLabel(a)}
            </option>
          ))}
        </select>
        {action === "" ? (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCategory("ALL")}
              aria-pressed={category === "ALL"}
              className={`min-h-11 rounded-md px-3 py-2 text-sm ${category === "ALL" ? "bg-surface-2 font-medium" : "text-muted"}`}
            >
              All
            </button>
            {AUDIT_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`min-h-11 rounded-md px-3 py-2 text-sm ${category === c ? "bg-surface-2 font-medium" : "text-muted"}`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {failed ? (
        <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          The log could not be loaded. Reload the page to try again.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="shield"
            variant="inline"
            title={entries.length === 0 ? "Nothing recorded yet" : "Nothing in this category"}
            description={
              entries.length === 0
                ? "Administrative changes appear here as they happen: sending mode, roles, mailboxes, keys, exports, and deletions."
                : "Try another category, or clear the action filter."
            }
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {visible.map((entry) => (
            <li key={entry.entryId} className="flex items-start gap-3 py-3">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${WEIGHT_DOT[auditWeight(entry.action)] ?? "bg-border"}`}
              />
              <div className="min-w-0">
                <p className="text-sm">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {auditLabel(entry.action)} · {entry.actorEmail} ·{" "}
                  <LocalTime value={entry.at} />
                </p>
                {Object.keys(entry.details).length > 0 ? (
                  <p className="mt-1 font-mono text-xs text-muted">
                    {Object.entries(entry.details)
                      .map(([k, v]) => `${k}=${v === null ? "none" : String(v)}`)
                      .join("  ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor !== null ? (
        <button
          onClick={() => void load(cursor, false, action)}
          disabled={loading}
          className="btn-secondary mt-4 min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load older entries"}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface SuppressionRow {
  suppressionId: string;
  email: string;
  reason: string;
  scope: string;
  source: string;
  active: boolean;
  createdAt: number;
  details: string;
}

const REASON_LABELS: Record<string, string> = {
  EMAIL_OPT_OUT: "Salesforce opt-out",
  UNSUBSCRIBED: "Unsubscribed",
  HARD_BOUNCE: "Bounced",
  MANUAL: "Added manually",
  INVALID: "Invalid email",
  COMPLAINT: "Complaint",
  OTHER: "Other",
};

export function SuppressionsManager({
  rows,
  isAdmin,
}: {
  rows: SuppressionRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState("");
  const [addScope, setAddScope] = useState<"USER" | "ORGANIZATION">("USER");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.active && (q === "" || r.email.toLowerCase().includes(q)));
  }, [rows, search]);

  async function addEmails() {
    setBusy(true);
    setError(null);
    try {
      const emails = addText
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, reason: "MANUAL", scope: addScope }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add those emails.");
      setNotice(
        `Added ${body.added} email${body.added === 1 ? "" : "s"}` +
          (body.skippedInvalid ? `; skipped ${body.skippedInvalid} invalid` : "") +
          "."
      );
      setAddText("");
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add those emails.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: SuppressionRow) {
    const reason = prompt(
      `Remove ${row.email} from the do-not-email list?\n\nThis person could be emailed again. Type a short reason to confirm:`
    );
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suppressionId: row.suppressionId,
          scope: row.scope,
          reason: reason.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not remove that entry.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that entry.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const lines = [
      "email,reason,scope,source,added",
      ...visible.map(
        (r) =>
          `${r.email},${r.reason},${r.scope},${r.source},${new Date(r.createdAt).toISOString()}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "do-not-email-list.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="card p-6">
      {notice && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email"
          aria-label="Search do-not-email list"
          className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Add emails
        </button>
        <button
          onClick={exportCsv}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      {showAdd && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <label htmlFor="add-suppressions" className="block text-sm font-medium text-slate-700">
            Paste one or more emails (one per line, or separated by commas)
          </label>
          <textarea
            id="add-suppressions"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm focus:border-primary focus:outline-none"
          />
          {isAdmin && (
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={addScope === "ORGANIZATION"}
                onChange={(e) => setAddScope(e.target.checked ? "ORGANIZATION" : "USER")}
              />
              Apply to the whole team (admin)
            </label>
          )}
          <button
            onClick={addEmails}
            disabled={busy || addText.trim() === ""}
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add to do-not-email list"}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {rows.length === 0
            ? "Nothing here yet. Opt-outs, unsubscribes, and bounces will appear automatically."
            : "No entries match this search."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Why</th>
                <th className="px-3 py-2">Applies to</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.suppressionId} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{r.email}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.scope === "ORGANIZATION" ? "Whole team" : "Only you"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(r.scope === "USER" || isAdmin) && (
                      <button
                        onClick={() => remove(r)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

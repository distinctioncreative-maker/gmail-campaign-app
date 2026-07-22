"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { recipientStatusBadge as statusBadge } from "@/lib/campaigns/statusLabels";

interface RecipientRow {
  recipientId: string;
  fullName: string;
  email: string;
  status: string;
  included: boolean;
  exclusionReason: string | null;
  scheduledAt: number | null;
  sentAt: number | null;
  gmailThreadId: string | null;
}

const FILTERS = ["All", "Batches", "Scheduled", "Sent", "Replied", "Excluded", "Problems"] as const;
type Filter = (typeof FILTERS)[number];
type SortKey = "fullName" | "email" | "status" | "time";

export function RecipientTable({
  campaignId,
  campaignStatus,
  emailsPerBatch,
  recipients,
}: {
  campaignId: string;
  campaignStatus: string;
  emailsPerBatch: number;
  recipients: RecipientRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );
  }, [recipients, query]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "Batches":
      case "Scheduled":
        return searched.filter((r) => ["PENDING", "SCHEDULED"].includes(r.status));
      case "Sent":
        return searched.filter((r) => r.status === "SENT");
      case "Replied":
        return searched.filter((r) => r.status === "REPLIED");
      case "Excluded":
        return searched.filter((r) => ["EXCLUDED", "SKIPPED", "CANCELLED"].includes(r.status));
      case "Problems":
        return searched.filter((r) => ["ERROR", "BOUNCED"].includes(r.status));
      default:
        return searched;
    }
  }, [searched, filter]);

  const { sorted, sort, toggle } = useSort<RecipientRow, SortKey>(
    filtered,
    {
      fullName: (r) => r.fullName || r.email,
      email: (r) => r.email,
      status: (r) => statusBadge(r.status).label,
      time: (r) => r.sentAt ?? r.scheduledAt,
    },
    { key: "time", dir: "asc" }
  );

  // Batches: scheduled recipients ordered by send time, chunked by batch size.
  const batches = useMemo(() => {
    const scheduled = [...filtered]
      .filter((r) => r.scheduledAt !== null)
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
    const size = Math.max(1, emailsPerBatch);
    const out: RecipientRow[][] = [];
    for (let i = 0; i < scheduled.length; i += size) out.push(scheduled.slice(i, i + size));
    return out;
  }, [filtered, emailsPerBatch]);

  async function undoUnsubscribe(recipientId: string, email: string) {
    const ok = await confirm({
      title: "Mark as a real reply?",
      body: `${email} will be counted as replied (not unsubscribed) and removed from your do-not-email list, so future campaigns can include them again.`,
      confirmLabel: "Yes, it was a real reply",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/recipients/${recipientId}/undo-unsubscribe`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not undo.");
      toast(data.message ?? "Corrected to a real reply.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not undo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function skip(recipientId: string, email: string) {
    const ok = await confirm({
      title: "Remove from campaign?",
      body: `${email} will not receive any more emails from this campaign.`,
      danger: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/campaigns/${campaignId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip_recipient", recipientId }),
    });
    setBusy(false);
    toast(`${email} removed.`, "success");
    router.refresh();
  }

  const canSkip = ["ACTIVE", "PAUSED", "READY", "DRAFT"].includes(campaignStatus);

  function rowActions(r: RecipientRow) {
    return (
      <div className="flex items-center justify-end gap-3">
        {r.gmailThreadId && (
          <a
            href={`https://mail.google.com/mail/u/0/#all/${r.gmailThreadId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open in Gmail
          </a>
        )}
        {canSkip && ["PENDING", "SCHEDULED"].includes(r.status) && (
          <button
            onClick={() => void skip(r.recipientId, r.email)}
            disabled={busy}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        )}
        {r.status === "UNSUBSCRIBED" && (
          <button
            onClick={() => void undoUnsubscribe(r.recipientId, r.email)}
            disabled={busy}
            title="If this was actually a normal reply, correct it and allow emailing again."
            className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
          >
            Not an unsubscribe? Undo
          </button>
        )}
      </div>
    );
  }

  function timeCell(r: RecipientRow) {
    if (r.sentAt) return <span className="text-slate-500">Sent <LocalTime value={r.sentAt} /></span>;
    if (r.scheduledAt && ["PENDING", "SCHEDULED"].includes(r.status))
      return <span className="text-slate-500">Planned <LocalTime value={r.scheduledAt} /></span>;
    return <span className="text-slate-300">—</span>;
  }

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-100 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-slate-400">
            {filter === "Batches" ? `${batches.length} batches` : `${sorted.length} shown`}
          </span>
        </div>
        <div className="segmented mt-2 flex flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`seg-btn ${filter === f ? "is-active" : ""}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[34rem] overflow-y-auto">
        {filter === "Batches" ? (
          batches.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No scheduled emails to batch.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {batches.map((group, i) => (
                <div key={i}>
                  <div className="sticky top-0 flex items-center justify-between bg-slate-50/90 px-3 py-1.5 text-xs font-semibold text-slate-500 backdrop-blur">
                    <span>Batch {i + 1}</span>
                    <span className="font-normal">
                      {group[0]?.scheduledAt ? (
                        <>~<LocalTime value={group[0].scheduledAt} options={{ hour: "numeric", minute: "2-digit" }} /> · {group.length} email{group.length === 1 ? "" : "s"}</>
                      ) : (
                        `${group.length} emails`
                      )}
                    </span>
                  </div>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {group.map((r) => (
                        <tr key={r.recipientId} className="border-t border-slate-50 hover:bg-slate-50/60">
                          <td className="px-3 py-2 font-medium">{r.fullName || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{r.email}</td>
                          <td className="px-3 py-2 text-xs">{timeCell(r)}</td>
                          <td className="px-3 py-2 text-right">{rowActions(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs text-slate-500 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
              <tr>
                <SortTh label="Name" sortKey="fullName" sort={sort} onToggle={toggle} className="py-2" />
                <SortTh label="Email" sortKey="email" sort={sort} onToggle={toggle} className="py-2" />
                <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} className="py-2" />
                <SortTh label="When" sortKey="time" sort={sort} onToggle={toggle} className="py-2" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-sm text-slate-500">
                    No one in this view.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const badge = statusBadge(r.status);
                  return (
                    <tr
                      key={r.recipientId}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2 font-medium">{r.fullName || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.email}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{timeCell(r)}</td>
                      <td className="px-3 py-2 text-right">{rowActions(r)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

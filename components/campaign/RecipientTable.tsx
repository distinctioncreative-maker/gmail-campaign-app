"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting", className: "bg-slate-100 text-slate-600" },
  SCHEDULED: { label: "Scheduled", className: "bg-blue-100 text-blue-700" },
  DRAFTED: { label: "Draft created", className: "bg-blue-100 text-blue-700" },
  SENT: { label: "Sent", className: "bg-green-100 text-green-700" },
  REPLIED: { label: "Replied 🎉", className: "bg-green-100 text-green-700" },
  BOUNCED: { label: "Bounced", className: "bg-amber-100 text-amber-700" },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-amber-100 text-amber-700" },
  SKIPPED: { label: "Removed", className: "bg-slate-200 text-slate-600" },
  EXCLUDED: { label: "Excluded for safety", className: "bg-amber-100 text-amber-700" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
  ERROR: { label: "Needs attention", className: "bg-red-100 text-red-700" },
};

const FILTERS = ["All", "Scheduled", "Sent", "Replied", "Excluded", "Problems"] as const;

export function RecipientTable({
  campaignId,
  campaignStatus,
  recipients,
}: {
  campaignId: string;
  campaignStatus: string;
  recipients: RecipientRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    switch (filter) {
      case "Scheduled":
        return recipients.filter((r) => ["PENDING", "SCHEDULED"].includes(r.status));
      case "Sent":
        return recipients.filter((r) => r.status === "SENT");
      case "Replied":
        return recipients.filter((r) => r.status === "REPLIED");
      case "Excluded":
        return recipients.filter((r) => ["EXCLUDED", "SKIPPED", "CANCELLED"].includes(r.status));
      case "Problems":
        return recipients.filter((r) => ["ERROR", "BOUNCED"].includes(r.status));
      default:
        return recipients;
    }
  }, [recipients, filter]);

  async function skip(recipientId: string, email: string) {
    if (!confirm(`Remove ${email} from this campaign? They will not receive any more emails from it.`))
      return;
    setBusy(true);
    await fetch(`/api/campaigns/${campaignId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip_recipient", recipientId }),
    });
    setBusy(false);
    router.refresh();
  }

  const canSkip = ["ACTIVE", "PAUSED", "READY", "DRAFT"].includes(campaignStatus);

  return (
    <div className="card">
      <div className="flex gap-1 border-b border-slate-100 p-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="p-4 text-sm text-slate-500">No one in this view.</td>
              </tr>
            ) : (
              visible.map((r) => {
                const badge = STATUS_LABELS[r.status] ?? {
                  label: r.status,
                  className: "bg-slate-100 text-slate-600",
                };
                return (
                  <tr key={r.recipientId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.fullName || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.sentAt
                        ? `Sent ${new Date(r.sentAt).toLocaleString()}`
                        : r.scheduledAt && ["PENDING", "SCHEDULED"].includes(r.status)
                          ? `Planned ${new Date(r.scheduledAt).toLocaleString()}`
                          : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.gmailThreadId && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${r.gmailThreadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mr-3 text-xs text-primary hover:underline"
                        >
                          Open in Gmail
                        </a>
                      )}
                      {canSkip && ["PENDING", "SCHEDULED"].includes(r.status) && (
                        <button
                          onClick={() => void skip(r.recipientId, r.email)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

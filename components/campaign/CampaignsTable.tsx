"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";
import { Icon } from "@/components/ui/Icon";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";

export interface CampaignRow {
  campaignId: string;
  name: string;
  status: string;
  statusLabel: string;
  statusClass: string;
  recipients: number;
  sent: number;
  replies: number;
  updatedAt: number;
}

type SortKey = "name" | "status" | "recipients" | "sent" | "replies" | "updatedAt";

export function CampaignsTable({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function deleteDraft(c: CampaignRow) {
    const ok = await confirm({
      title: "Delete this draft?",
      body: `“${c.name}” will be permanently removed. This can't be undone.`,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(c.campaignId);
    try {
      await fetchJson(`/api/campaigns/${c.campaignId}`, { method: "DELETE" });
      toast("Draft deleted.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete that campaign.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns;
  }, [campaigns, query]);

  const { sorted, sort, toggle } = useSort<CampaignRow, SortKey>(
    searched,
    {
      name: (c) => c.name,
      status: (c) => c.statusLabel,
      recipients: (c) => c.recipients,
      sent: (c) => c.sent,
      replies: (c) => c.replies,
      updatedAt: (c) => c.updatedAt,
    },
    { key: "updatedAt", dir: "desc" }
  );

  return (
    <div className="mt-6 card overflow-hidden">
      <div className="border-b border-slate-100 p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaigns…"
          className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <SortTh label="Campaign" sortKey="name" sort={sort} onToggle={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              <SortTh label="Recipients" sortKey="recipients" sort={sort} onToggle={toggle} />
              <SortTh label="Sent" sortKey="sent" sort={sort} onToggle={toggle} />
              <SortTh label="Replies" sortKey="replies" sort={sort} onToggle={toggle} />
              <SortTh label="Updated" sortKey="updatedAt" sort={sort} onToggle={toggle} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.campaignId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/campaigns/${c.campaignId}`} className="hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${c.statusClass}`}>{c.statusLabel}</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.recipients}</td>
                <td className="px-4 py-3 tabular-nums">{c.sent}</td>
                <td className="px-4 py-3 tabular-nums">{c.replies}</td>
                <td className="px-4 py-3 text-slate-500">
                  <LocalTime value={c.updatedAt} options={{ dateStyle: "medium" }} />
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === "DRAFT" && (
                    <button
                      onClick={() => void deleteDraft(c)}
                      disabled={busyId === c.campaignId}
                      aria-label={`Delete draft ${c.name}`}
                      title="Delete draft"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

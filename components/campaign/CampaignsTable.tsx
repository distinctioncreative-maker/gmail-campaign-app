"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";

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
  const [query, setQuery] = useState("");

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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.statusClass}`}>
                    {c.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3">{c.recipients}</td>
                <td className="px-4 py-3">{c.sent}</td>
                <td className="px-4 py-3">{c.replies}</td>
                <td className="px-4 py-3 text-slate-500">
                  <LocalTime value={c.updatedAt} options={{ dateStyle: "medium" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

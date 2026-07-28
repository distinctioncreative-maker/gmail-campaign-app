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
  initialSent: number;
  sent: number;
  replies: number;
  bounces: number;
  errors: number;
  progressRate: number;
  replyRate: number;
  updatedAt: number;
  archived: boolean;
}

const TERMINAL = ["DRAFT", "STOPPED", "CANCELLED", "COMPLETED", "ERROR"];

type SortKey =
  | "name"
  | "status"
  | "progress"
  | "sent"
  | "replyRate"
  | "problems"
  | "updatedAt";

type CampaignView = "all" | "sending" | "drafts" | "attention" | "finished";

function belongsToView(campaign: CampaignRow, view: CampaignView): boolean {
  if (view === "all") return true;
  if (view === "sending") {
    return ["READY", "PREPARING", "ACTIVE", "PAUSED"].includes(campaign.status);
  }
  if (view === "drafts") return campaign.status === "DRAFT";
  if (view === "attention") return campaign.status === "ERROR" || campaign.errors > 0;
  return ["STOPPED", "CANCELLED", "COMPLETED"].includes(campaign.status);
}

export function CampaignsTable({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CampaignView>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function removeCampaign(c: CampaignRow) {
    const ok = await confirm({
      title: "Delete this campaign?",
      body: `“${c.name}” and its records will be permanently removed. This can't be undone.`,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(c.campaignId);
    try {
      await fetchJson(`/api/campaigns/${c.campaignId}`, { method: "DELETE" });
      toast("Campaign deleted.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete that campaign.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(c: CampaignRow, archived: boolean) {
    setBusyId(c.campaignId);
    try {
      const res = await fetchJson<{ message?: string }>(`/api/campaigns/${c.campaignId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: archived ? "archive" : "unarchive" }),
      });
      toast(res.message ?? (archived ? "Archived." : "Restored."), "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter(
      (campaign) =>
        belongsToView(campaign, view) &&
        (!q ||
          campaign.name.toLowerCase().includes(q) ||
          campaign.statusLabel.toLowerCase().includes(q))
    );
  }, [campaigns, query, view]);

  const { sorted, sort, toggle } = useSort<CampaignRow, SortKey>(
    searched,
    {
      name: (c) => c.name,
      status: (c) => c.statusLabel,
      progress: (c) => c.progressRate,
      sent: (c) => c.sent,
      replyRate: (c) => c.replyRate,
      problems: (c) => c.errors + c.bounces,
      updatedAt: (c) => c.updatedAt,
    },
    { key: "updatedAt", dir: "desc" }
  );

  return (
    <div className="mt-6 card overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted/70">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by campaign or status"
              className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="segmented min-w-max">
              {(
                [
                  ["all", "All"],
                  ["sending", "In progress"],
                  ["drafts", "Drafts"],
                  ["attention", "Needs attention"],
                  ["finished", "Finished"],
                ] as Array<[CampaignView, string]>
              ).map(([key, label]) => {
                const count = campaigns.filter((campaign) =>
                  belongsToView(campaign, key)
                ).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={`seg-btn ${view === key ? "is-active" : ""}`}
                  >
                    {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {sorted.length} of {campaigns.length} campaigns
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <SortTh label="Campaign" sortKey="name" sort={sort} onToggle={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              <SortTh label="Progress" sortKey="progress" sort={sort} onToggle={toggle} />
              <SortTh label="Sent" sortKey="sent" sort={sort} onToggle={toggle} />
              <SortTh label="Reply rate" sortKey="replyRate" sort={sort} onToggle={toggle} />
              <SortTh label="Problems" sortKey="problems" sort={sort} onToggle={toggle} />
              <SortTh label="Updated" sortKey="updatedAt" sort={sort} onToggle={toggle} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr
                key={c.campaignId}
                className="animate-rise border-b border-border last:border-0 hover:bg-surface-2"
                style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
              >
                <td className="px-4 py-3 font-medium">
                  <Link href={`/campaigns/${c.campaignId}`} className="hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${c.statusClass}`}>{c.statusLabel}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-36 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full brand-gradient"
                        style={{ width: `${c.progressRate}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted">
                      {c.progressRate.toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted/70">
                    {Math.min(c.recipients, c.initialSent)} of {c.recipients}
                  </p>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.sent.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <p className="font-medium tabular-nums">{c.replyRate.toFixed(1)}%</p>
                  <p className="text-[11px] text-muted/70">
                    {c.replies.toLocaleString()} repl{c.replies === 1 ? "y" : "ies"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {c.errors > 0 || c.bounces > 0 ? (
                    <div className="space-y-0.5 text-xs">
                      {c.errors > 0 ? (
                        <p className="font-medium text-red-600">
                          {c.errors} error{c.errors === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      {c.bounces > 0 ? (
                        <p className="text-amber-600">
                          {c.bounces} bounce{c.bounces === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted/70">None</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  <LocalTime value={c.updatedAt} options={{ dateStyle: "medium" }} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {c.archived ? (
                      <button
                        onClick={() => void setArchived(c, false)}
                        disabled={busyId === c.campaignId}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary-soft disabled:opacity-40"
                      >
                        Restore
                      </button>
                    ) : (
                      TERMINAL.includes(c.status) &&
                      c.status !== "DRAFT" && (
                        <button
                          onClick={() => void setArchived(c, true)}
                          disabled={busyId === c.campaignId}
                          title="Archive (hide from this list)"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 disabled:opacity-40"
                        >
                          Archive
                        </button>
                      )
                    )}
                    {TERMINAL.includes(c.status) && (
                      <button
                        onClick={() => void removeCampaign(c)}
                        disabled={busyId === c.campaignId}
                        aria-label={`Delete ${c.name}`}
                        title="Delete"
                        className="rounded-lg p-1.5 text-muted/70 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No campaigns match this view
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Clear the search or choose another status filter.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

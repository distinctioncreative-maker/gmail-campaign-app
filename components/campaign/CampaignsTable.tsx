"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Meter } from "@/components/ui/charts/Meter";
import { LocalTime } from "@/components/LocalTime";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";
import { Icon } from "@/components/ui/Icon";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { DataTable, TableRow } from "@/components/ui/DataTable";

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
  unsubscribes: number;
  errors: number;
  progressRate: number;
  replyRate: number;
  updatedAt: number;
  archived: boolean;
  archivedAt: number | null;
  deletedAt: number | null;
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

export function CampaignsTable({
  campaigns,
  lifecycleView,
}: {
  campaigns: CampaignRow[];
  lifecycleView: "active" | "archived" | "deleted";
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CampaignView>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function removeCampaign(c: CampaignRow) {
    const permanent = c.deletedAt !== null;
    const ok = await confirm({
      title: permanent
        ? "Delete this campaign forever?"
        : "Move this campaign to Recently Deleted?",
      body: permanent
        ? `“${c.name}” and all recipient, message, event, and metric records will be permanently removed. This cannot be undone.`
        : `“${c.name}” will stop contributing to workspace totals. Its metrics and history will remain recoverable in Recently Deleted.`,
      danger: true,
      confirmLabel: permanent ? "Delete forever" : "Move to Recently Deleted",
    });
    if (!ok) return;
    setBusyId(c.campaignId);
    try {
      await fetchJson(
        `/api/campaigns/${c.campaignId}${permanent ? "?permanent=1" : ""}`,
        { method: "DELETE" }
      );
      toast(
        permanent
          ? "Campaign permanently deleted."
          : "Campaign moved to Recently Deleted.",
        "success"
      );
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete that campaign.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function restoreDeleted(c: CampaignRow) {
    setBusyId(c.campaignId);
    try {
      const res = await fetchJson<{ message?: string }>(
        `/api/campaigns/${c.campaignId}/control`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restore_deleted" }),
        }
      );
      toast(res.message ?? "Campaign restored.", "success");
      router.refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not restore that campaign.",
        "error"
      );
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
      problems: (c) => c.errors + c.bounces + c.unsubscribes,
      updatedAt: (c) => c.deletedAt ?? c.archivedAt ?? c.updatedAt,
    },
    { key: "updatedAt", dir: "desc" }
  );

  return (
    <div className="mt-6 card overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by campaign or status"
              className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
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
          Showing {sorted.length} of {campaigns.length}{" "}
          {lifecycleView === "deleted"
            ? "deleted"
            : lifecycleView === "archived"
              ? "archived"
              : "active"}{" "}
          campaigns
        </p>
      </div>
      <div className="divide-y divide-border md:hidden">
        {sorted.map((c) => (
          <article key={c.campaignId} className="p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/campaigns/${c.campaignId}`}
                  className="block truncate font-semibold text-foreground"
                >
                  {c.name}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${c.statusClass}`}>
                    {c.statusLabel}
                  </span>
                  <span className="text-xs text-muted">
                    {c.deletedAt !== null
                      ? "Deleted"
                      : c.archivedAt !== null
                        ? "Archived"
                        : "Updated"}{" "}
                    <LocalTime
                      value={c.deletedAt ?? c.archivedAt ?? c.updatedAt}
                      options={{ dateStyle: "medium" }}
                    />
                  </span>
                </div>
              </div>
              <Link
                href={`/campaigns/${c.campaignId}`}
                aria-label={`Open ${c.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <Icon name="chevronRight" size={18} />
              </Link>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Progress</span>
                <span className="tabular-nums text-muted">
                  {c.progressRate.toFixed(0)}%
                </span>
              </div>
              {/* The track is derived from the fill inside Meter, so the
                  1.00:1 invisible-bar bug this rule used to carry cannot recur. */}
              <Meter value={c.progressRate} tone="good" height={8} className="mt-2" />
              <p className="mt-1 text-2xs text-muted">
                {Math.min(c.recipients, c.initialSent)} of {c.recipients} leads
                contacted
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3">
              <div>
                <dt className="text-3xs uppercase tracking-wide text-muted">
                  Sent
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">
                  {c.sent.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-3xs uppercase tracking-wide text-muted">
                  Replies
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">
                  {c.replies.toLocaleString()}{" "}
                  <span className="text-3xs font-normal text-muted">
                    {c.replyRate.toFixed(1)}%
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-3xs uppercase tracking-wide text-muted">
                  Problems
                </dt>
                <dd
                  className={`mt-1 text-sm font-semibold tabular-nums ${
                    c.errors + c.bounces + c.unsubscribes > 0 ? "text-warning" : ""
                  }`}
                >
                  {(c.errors + c.bounces + c.unsubscribes).toLocaleString()}
                </dd>
              </div>
            </dl>

            {(TERMINAL.includes(c.status) || c.archived || c.deletedAt !== null) && (
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                {c.deletedAt !== null ? (
                  <button
                    onClick={() => void restoreDeleted(c)}
                    disabled={busyId === c.campaignId}
                    className="min-h-11 rounded-md px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
                  >
                    Restore
                  </button>
                ) : c.archived ? (
                  <button
                    onClick={() => void setArchived(c, false)}
                    disabled={busyId === c.campaignId}
                    className="min-h-11 rounded-md px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
                  >
                    Restore
                  </button>
                ) : (
                  c.status !== "DRAFT" && (
                    <button
                      onClick={() => void setArchived(c, true)}
                      disabled={busyId === c.campaignId}
                      className="min-h-11 rounded-md px-3 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-40"
                    >
                      Archive
                    </button>
                  )
                )}
                {TERMINAL.includes(c.status) && (
                  <button
                    onClick={() => void removeCampaign(c)}
                    disabled={busyId === c.campaignId}
                    className="flex min-h-11 items-center gap-2 rounded-md px-3 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-40"
                  >
                    <Icon name="trash" size={16} />
                    {c.deletedAt !== null ? "Delete forever" : "Delete"}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {sorted.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              No campaigns match this view
            </p>
            <p className="mt-1 text-xs text-muted">
              Clear the search or choose another status filter.
            </p>
          </div>
        )}
      </div>
      <DataTable
        className="hidden md:block"
        minWidth="960px"
        head={
          <>
              <SortTh label="Campaign" sortKey="name" sort={sort} onToggle={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              <SortTh label="Progress" sortKey="progress" sort={sort} onToggle={toggle} />
              <SortTh label="Sent" sortKey="sent" sort={sort} onToggle={toggle} />
              <SortTh label="Reply rate" sortKey="replyRate" sort={sort} onToggle={toggle} />
              <SortTh label="Problems" sortKey="problems" sort={sort} onToggle={toggle} />
              <SortTh
                label={lifecycleView === "deleted" ? "Deleted" : lifecycleView === "archived" ? "Archived" : "Updated"}
                sortKey="updatedAt"
                sort={sort}
                onToggle={toggle}
              />
            <th className="px-4 py-3" />
          </>
        }
      >
            {sorted.map((c, i) => (
              <TableRow
                key={c.campaignId}
                className="animate-rise"
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
                    <Meter value={c.progressRate} tone="good" className="flex-1" />
                    <span className="w-10 text-right text-xs tabular-nums text-muted">
                      {c.progressRate.toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-2xs text-muted">
                    {Math.min(c.recipients, c.initialSent)} of {c.recipients}
                  </p>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.sent.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <p className="font-medium tabular-nums">{c.replyRate.toFixed(1)}%</p>
                  <p className="text-2xs text-muted">
                    {c.replies.toLocaleString()} repl{c.replies === 1 ? "y" : "ies"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {c.errors > 0 || c.bounces > 0 || c.unsubscribes > 0 ? (
                    <div className="space-y-0.5 text-xs">
                      {c.errors > 0 ? (
                        <p className="font-medium text-danger">
                          {c.errors} error{c.errors === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      {c.bounces > 0 ? (
                        <p className="text-warning">
                          {c.bounces} bounce{c.bounces === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      {c.unsubscribes > 0 ? (
                        <p className="text-muted">
                          {c.unsubscribes} opt-out{c.unsubscribes === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">None</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  <LocalTime
                    value={c.deletedAt ?? c.archivedAt ?? c.updatedAt}
                    options={{ dateStyle: "medium" }}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {c.deletedAt !== null ? (
                      <button
                        onClick={() => void restoreDeleted(c)}
                        disabled={busyId === c.campaignId}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                      >
                        Restore
                      </button>
                    ) : c.archived ? (
                      <button
                        onClick={() => void setArchived(c, false)}
                        disabled={busyId === c.campaignId}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
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
                        aria-label={`${c.deletedAt !== null ? "Delete forever" : "Delete"} ${c.name}`}
                        title={c.deletedAt !== null ? "Delete forever" : "Move to Recently Deleted"}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </TableRow>
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
      </DataTable>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import { TagChips } from "@/components/leads/TagChips";
import {
  BulkLeadOrganizer,
  type LeadListOption,
  type OrganizeLeadAction,
} from "@/components/leads/BulkLeadOrganizer";
import { LocalTime } from "@/components/LocalTime";
import { SavedViewBar } from "@/components/views/SavedViewBar";

export interface ContactRow {
  contactId: string;
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  campaignCount: number;
  emailsSentCount: number;
  replyCount: number;
  suppressed: boolean;
  emailOptOut: boolean;
  repliedAt: number | null;
  lastCampaignAt: number | null;
  tags: string[];
  listIds: string[];
  createdAt: number;
}

type Filter = "all" | "ready" | "contacted" | "replied" | "excluded";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "contacted", label: "Contacted before" },
  { id: "replied", label: "Replied" },
  { id: "excluded", label: "Excluded" },
];

function matches(c: ContactRow, filter: Filter): boolean {
  switch (filter) {
    case "ready":
      return !c.suppressed && !c.emailOptOut && c.campaignCount === 0;
    case "contacted":
      return c.campaignCount > 0;
    case "replied":
      return c.repliedAt !== null;
    case "excluded":
      return c.suppressed || c.emailOptOut;
    default:
      return true;
  }
}

export function ContactsTable({
  contacts,
  leadLists = [],
}: {
  contacts: ContactRow[];
  leadLists?: LeadListOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const availableTags = useMemo(
    () =>
      [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [contacts]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        matches(c, filter) &&
        (!tagFilter || c.tags.some((tag) => tag.toLocaleLowerCase() === tagFilter.toLocaleLowerCase())) &&
        (!listFilter || c.listIds.includes(listFilter)) &&
        (q === "" ||
          c.fullName.toLowerCase().includes(q) ||
          c.businessName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.tags.some((tag) => tag.toLowerCase().includes(q)))
    );
  }, [contacts, search, filter, tagFilter, listFilter]);

  const statusRank = (c: ContactRow) =>
    c.suppressed || c.emailOptOut ? 3 : c.repliedAt ? 2 : c.campaignCount > 0 ? 1 : 0;

  const statusBadge = (c: ContactRow): { label: string; className: string } =>
    c.suppressed || c.emailOptOut
      ? { label: "Excluded for safety", className: "bg-warning-soft text-warning" }
      : c.repliedAt
        ? { label: "Replied", className: "bg-info-soft text-info" }
        : c.campaignCount > 0
          ? { label: "Contacted before", className: "bg-info-soft text-info" }
          : { label: "Ready", className: "bg-success-soft text-success" };

  const { sorted, sort, toggle, setSort } = useSort<
    ContactRow,
    "name" | "business" | "email" | "phone" | "engagement" | "status" | "added"
  >(
    visible,
    {
      name: (c) => c.fullName || c.email,
      business: (c) => c.businessName,
      email: (c) => c.email,
      phone: (c) => c.phone,
      engagement: (c) => c.replyCount * 1000 + c.emailsSentCount,
      status: (c) => statusRank(c),
      added: (c) => c.createdAt,
    },
    { key: "name", dir: "asc" }
  );

  const allVisibleSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.contactId));

  function toggleOne(contactId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const c of sorted) next.delete(c.contactId);
      else for (const c of sorted) next.add(c.contactId);
      return next;
    });
  }

  async function bulk(
    action: "delete" | "optout" | "allow" | OrganizeLeadAction,
    value?: string
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}?`,
        body: "They're removed from your list permanently. Past campaign emails and history are not affected.",
        danger: true,
        confirmLabel: `Delete ${ids.length}`,
      });
      if (!ok) return;
    }
    if (action === "optout") {
      const ok = await confirm({
        title: `Mark ${ids.length} lead${ids.length === 1 ? "" : "s"} Do Not Email?`,
        body: "They'll be excluded from every future campaign until you allow them again.",
        danger: true,
        confirmLabel: "Mark Do Not Email",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          contactIds: ids,
          ...(action === "add_tag" || action === "remove_tag" ? { tag: value } : {}),
          ...(action === "add_to_list" || action === "remove_from_list" ? { listId: value } : {}),
        }),
      });
      toast(res.message ?? "Done.", "success");
      if (
        action === "delete" ||
        action === "optout" ||
        action === "allow" ||
        action === "add_to_list" ||
        action === "remove_from_list"
      ) {
        setSelected(new Set());
      }
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work: try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const filtersActive = search.trim() !== "" || filter !== "all" || tagFilter !== "" || listFilter !== "";

  /** The four controls plus the sort, as the shape a saved view stores. Search
   * text is included: "the leads at Acme" is a view, and leaving the term out
   * would restore a view that shows the wrong rows. */
  const viewState = {
    filters: { search, status: filter, tag: tagFilter, list: listFilter },
    sortKey: sort.key,
    sortDir: sort.dir,
  };

  function applyView(next: { filters: Record<string, string>; sortKey: string; sortDir: "asc" | "desc" }) {
    setSearch(next.filters.search ?? "");
    // Falls back to the table's own default when a stored view names a filter
    // value this build no longer offers, rather than leaving the control in an
    // impossible state.
    const status = next.filters.status ?? "all";
    setFilter(FILTERS.some((f) => f.id === status) ? (status as Filter) : "all");
    setTagFilter(next.filters.tag ?? "");
    setListFilter(next.filters.list ?? "");
    if (next.sortKey !== "") {
      setSort({ key: next.sortKey as typeof sort.key, dir: next.sortDir });
    }
    setSelected(new Set());
  }

  function resetView() {
    applyView({ filters: {}, sortKey: "name", sortDir: "asc" });
  }

  return (
    <div>
      <SavedViewBar
        surface="LEADS"
        current={viewState}
        onApply={applyView}
        onReset={resetView}
      />
      <div className="card grid gap-3 p-3 xl:grid-cols-[minmax(16rem,1fr)_auto] xl:items-end">
        <div className="relative w-full">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, business, or email"
            aria-label="Search leads"
            className="min-h-11 w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="overflow-x-auto pb-1 xl:justify-self-end">
          <div className="segmented min-w-max">
            {FILTERS.map((f) => {
              const count = contacts.filter((contact) => matches(contact, f.id)).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`seg-btn ${filter === f.id ? "is-active" : ""}`}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-xs font-medium text-muted" htmlFor="lead-tag-filter">
            Tag
            <select
              id="lead-tag-filter"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted" htmlFor="lead-list-filter">
            Lead list
            <select
              id="lead-list-filter"
              value={listFilter}
              onChange={(event) => setListFilter(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">All lead lists</option>
              {leadLists.map((list) => <option key={list.listId} value={list.listId}>{list.name}</option>)}
            </select>
          </label>
          <div className="flex min-h-11 items-center justify-between gap-2 self-end sm:col-span-2 xl:col-span-1 xl:justify-end">
            <p className="text-xs text-muted" aria-live="polite">{sorted.length} shown on this page</p>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setTagFilter("");
                  setListFilter("");
                }}
                className="btn-ghost min-h-11 px-3 text-xs"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="glass mt-3 rounded-xl border border-border p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto px-1 text-sm font-medium" aria-live="polite">
              {selected.size} selected
            </span>
            <button onClick={() => void bulk("optout")} disabled={busy} className="btn-secondary min-h-11 px-3 text-xs">
              Do Not Email
            </button>
            <button onClick={() => void bulk("allow")} disabled={busy} className="btn-ghost min-h-11 px-3 text-xs">
              Allow emailing
            </button>
            <button onClick={() => void bulk("delete")} disabled={busy} className="btn-danger min-h-11 px-3 text-xs">
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={busy}
              className="btn-ghost min-h-11 px-3 text-xs text-muted"
            >
              Clear selection
            </button>
          </div>
          <BulkLeadOrganizer
            selectedCount={selected.size}
            availableTags={availableTags}
            leadLists={leadLists}
            busy={busy}
            onApply={(action, value) => bulk(action, value)}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface p-6 text-sm text-muted shadow-sm">
          {contacts.length === 0
            ? "No contacts yet. Import your first lead list above to get started."
            : "No leads match the current search and filters."}
        </p>
      ) : (
        <>
        {/* Mobile: stacked cards */}
        <ul className="mt-3 space-y-2 sm:hidden">
          {sorted.map((c) => {
            const b = statusBadge(c);
            return (
              <li
                key={c.contactId}
                className={`card flex items-start gap-3 p-3 ${selected.has(c.contactId) ? "ring-1 ring-border" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.contactId)}
                  onChange={() => toggleOne(c.contactId)}
                  aria-label={`Select ${c.fullName || c.email}`}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
                />
                <Link href={`/leads/${c.contactId}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.fullName || c.email}</p>
                  <p className="truncate text-xs text-muted">{c.businessName || c.email}</p>
                  <TagChips tags={c.tags} className="mt-1.5" />
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${b.className}`}>{b.label}</span>
                    {(c.emailsSentCount > 0 || c.campaignCount > 0) && (
                      <span className="text-xs tabular-nums text-muted">
                        {c.emailsSentCount} sent
                        {c.replyCount > 0 && <span className="font-medium text-success"> · {c.replyCount} replied</span>}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    Added <LocalTime value={c.createdAt} options={{ dateStyle: "medium" }} />
                  </p>
                </Link>
                <span aria-hidden className="mt-1 text-muted">›</span>
              </li>
            );
          })}
        </ul>

        {/* Desktop: table */}
        <div className="mt-3 hidden overflow-x-auto card sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all shown leads"
                    className="h-5 w-5 accent-[var(--primary)]"
                  />
                </th>
                <SortTh label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                <SortTh label="Business" sortKey="business" sort={sort} onToggle={toggle} />
                <th className="px-4 py-3 font-semibold">Tags</th>
                <SortTh label="Email" sortKey="email" sort={sort} onToggle={toggle} />
                <SortTh label="Phone" sortKey="phone" sort={sort} onToggle={toggle} />
                <SortTh label="Engagement" sortKey="engagement" sort={sort} onToggle={toggle} />
                <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                <SortTh label="Date added" sortKey="added" sort={sort} onToggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.contactId}
                  className={`border-b border-border last:border-0 hover:bg-surface-2 ${
                    selected.has(c.contactId) ? "bg-surface-2/40" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.contactId)}
                      onChange={() => toggleOne(c.contactId)}
                      aria-label={`Select ${c.fullName || c.email}`}
                      className="h-5 w-5 accent-[var(--primary)]"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/leads/${c.contactId}`} className="hover:underline">
                      {c.fullName || "Not available"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.businessName}</td>
                  <td className="min-w-40 px-4 py-3"><TagChips tags={c.tags} /></td>
                  <td className="px-4 py-3 text-muted">{c.email}</td>
                  <td className="px-4 py-3 text-muted">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {c.emailsSentCount === 0 && c.campaignCount === 0 ? (
                      <span className="text-muted">No activity</span>
                    ) : (
                      <span className="tabular-nums">
                        {c.emailsSentCount} sent
                        {c.replyCount > 0 && (
                          <span className="font-medium text-success"> · {c.replyCount} replied</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const b = statusBadge(c);
                      return (
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${b.className}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                    <LocalTime value={c.createdAt} options={{ dateStyle: "medium" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

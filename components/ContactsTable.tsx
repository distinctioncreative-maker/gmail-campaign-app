"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSort } from "@/lib/hooks/useSort";
import { SortTh } from "@/components/SortTh";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";

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

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        matches(c, filter) &&
        (q === "" ||
          c.fullName.toLowerCase().includes(q) ||
          c.businessName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q))
    );
  }, [contacts, search, filter]);

  const statusRank = (c: ContactRow) =>
    c.suppressed || c.emailOptOut ? 3 : c.repliedAt ? 2 : c.campaignCount > 0 ? 1 : 0;

  const { sorted, sort, toggle } = useSort<
    ContactRow,
    "name" | "business" | "email" | "phone" | "engagement" | "status"
  >(
    visible,
    {
      name: (c) => c.fullName || c.email,
      business: (c) => c.businessName,
      email: (c) => c.email,
      phone: (c) => c.phone,
      engagement: (c) => c.replyCount * 1000 + c.emailsSentCount,
      status: (c) => statusRank(c),
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

  async function bulk(action: "delete" | "optout" | "allow") {
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
        body: JSON.stringify({ action, contactIds: ids }),
      });
      toast(res.message ?? "Done.", "success");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, business, or email"
          aria-label="Search contacts"
          className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="segmented flex">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`seg-btn ${filter === f.id ? "is-active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="glass sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
          <span className="px-1 text-sm font-medium">
            {selected.size} selected
          </span>
          <button onClick={() => void bulk("delete")} disabled={busy} className="btn-danger px-3 py-1.5 text-xs">
            Delete
          </button>
          <button onClick={() => void bulk("optout")} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
            Do Not Email
          </button>
          <button onClick={() => void bulk("allow")} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
            Allow emailing
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={busy}
            className="btn-ghost px-3 py-1.5 text-xs text-slate-500"
          >
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          {contacts.length === 0
            ? "No contacts yet. Import your first lead list above to get started."
            : "No contacts match this search."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all shown leads"
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                </th>
                <SortTh label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                <SortTh label="Business" sortKey="business" sort={sort} onToggle={toggle} />
                <SortTh label="Email" sortKey="email" sort={sort} onToggle={toggle} />
                <SortTh label="Phone" sortKey="phone" sort={sort} onToggle={toggle} />
                <SortTh label="Engagement" sortKey="engagement" sort={sort} onToggle={toggle} />
                <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.contactId}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                    selected.has(c.contactId) ? "bg-primary-soft/40" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.contactId)}
                      onChange={() => toggleOne(c.contactId)}
                      aria-label={`Select ${c.fullName || c.email}`}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/leads/${c.contactId}`} className="hover:underline">
                      {c.fullName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.businessName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {c.emailsSentCount === 0 && c.campaignCount === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className="tabular-nums">
                        {c.emailsSentCount} sent
                        {c.replyCount > 0 && (
                          <span className="font-medium text-green-600"> · {c.replyCount} replied</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.suppressed || c.emailOptOut ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Excluded for safety
                      </span>
                    ) : c.repliedAt ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        Replied
                      </span>
                    ) : c.campaignCount > 0 ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        Contacted before
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Ready
                      </span>
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

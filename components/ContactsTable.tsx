"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ContactRow {
  contactId: string;
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  campaignCount: number;
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.id
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          {contacts.length === 0
            ? "No contacts yet. Import your first lead list above to get started."
            : "No contacts match this search."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.contactId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/leads/${c.contactId}`} className="hover:underline">
                      {c.fullName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.businessName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
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

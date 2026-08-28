"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import { LeadPreviewTable } from "@/components/imports/LeadPreviewTable";
import type { ClassifiedLead } from "@/components/imports/leadBadges";

/**
 * Find leads from a data provider.
 *
 * The results hand straight to `LeadPreviewTable`, the same component the CSV and
 * Salesforce imports use, so a sourced lead gets the identical verification
 * badges, the identical "contacted before" warnings, and the identical import
 * path. Building a second preview would have meant maintaining two of everything
 * and eventually having two sets of rules about what may be imported.
 *
 * The credit line is shown before the first search rather than after. Sourcing
 * costs money per row, and a customer should know that from the interface rather
 * than from running out.
 */

interface SearchResponse {
  provider: string;
  leads: ClassifiedLead[];
  totalRecords: number;
  totalAvailable: number;
  page: number;
  withheld: number;
  creditsUsed: number;
  creditsMessage: string;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function SourcingPanel({
  configured,
  providerName,
  initialCredits,
  listId,
}: {
  configured: boolean;
  providerName: string;
  initialCredits: string;
  listId?: string;
}) {
  const toast = useToast();
  const [titles, setTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [locations, setLocations] = useState("");
  const [keywords, setKeywords] = useState("");
  const [minEmployees, setMinEmployees] = useState("");
  const [maxEmployees, setMaxEmployees] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [credits, setCredits] = useState(initialCredits);
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="card p-6 sm:p-7">
        <h2 className="font-medium">Find leads</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Sourcing is not set up on this deployment yet. It needs a data provider account, and until
          one is configured this page cannot search. Importing a list you already have works as
          normal.
        </p>
      </div>
    );
  }

  async function search(nextPage: number) {
    setBusy(true);
    try {
      const res = await fetchJson<SearchResponse>("/api/sourcing/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.trim(),
          titles: splitList(titles),
          industries: splitList(industries),
          locations: splitList(locations),
          minEmployees: minEmployees.trim() === "" ? null : Number(minEmployees),
          maxEmployees: maxEmployees.trim() === "" ? null : Number(maxEmployees),
          page: nextPage,
          perPage,
        }),
      });
      setResult(res);
      setPage(res.page);
      setCredits(res.creditsMessage);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That search did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div>
        <div className="card p-5 sm:p-6 mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">
              {result.totalRecords} lead{result.totalRecords === 1 ? "" : "s"} from{" "}
              {result.provider}
              {result.totalAvailable > result.totalRecords
                ? ` of about ${result.totalAvailable.toLocaleString()} matching`
                : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {result.withheld > 0
                ? `${result.withheld} more matched but the provider did not release an address, so they are not shown. `
                : ""}
              {credits}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void search(page + 1)}
              disabled={busy}
              className="btn-secondary min-h-11 px-3 py-2 text-sm disabled:opacity-50"
            >
              {busy ? "Loading…" : "Next page"}
            </button>
            <button
              onClick={() => setResult(null)}
              className="btn-ghost min-h-11 px-3 py-2 text-sm"
            >
              New search
            </button>
          </div>
        </div>
        <LeadPreviewTable
          leads={result.leads}
          globalWarnings={[]}
          listId={listId}
          onDone={(summary) => {
            toast(summary, "success");
            setResult(null);
          }}
          onStartOver={() => setResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-7">
      <h2 className="font-medium">Find leads</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Search {providerName} for people who match, preview them with the same address checks as an
        import, then add the ones you want. {credits}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Job titles</span>
          <input
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder="Owner, Founder, CFO"
            className="mt-1 min-h-11 w-full"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Industries</span>
          <input
            value={industries}
            onChange={(e) => setIndustries(e.target.value)}
            placeholder="construction, logistics"
            className="mt-1 min-h-11 w-full"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Locations</span>
          <input
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="New York, Texas"
            className="mt-1 min-h-11 w-full"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Keywords</span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="equipment financing"
            className="mt-1 min-h-11 w-full"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Staff from</span>
          <input
            value={minEmployees}
            onChange={(e) => setMinEmployees(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="5"
            className="mt-1 min-h-11 w-full"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">Staff to</span>
          <input
            value={maxEmployees}
            onChange={(e) => setMaxEmployees(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="200"
            className="mt-1 min-h-11 w-full"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-xs font-medium text-muted">How many</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="mt-1 block min-h-11"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} leads
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void search(1)}
          disabled={busy}
          className="btn-primary flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <Icon name="search" size={15} aria-hidden />
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">
        Each lead returned uses one credit, whether or not you import it, because the provider bills
        for the lookup. Add at least a title, an industry, or a keyword: an unfiltered search returns
        everybody and spends credits doing it.
      </p>
    </div>
  );
}

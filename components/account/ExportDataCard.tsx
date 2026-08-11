"use client";

import { DATASET_INFO, EXPORT_DATASETS } from "@/lib/export/serialize";
import { Icon } from "@/components/ui/Icon";

/**
 * Export your data.
 *
 * Plain links, not fetch-and-blob. The browser already knows how to download a
 * streamed attachment, and doing it by hand would mean holding a workspace's
 * entire lead list in a JavaScript string first, which defeats the point of
 * streaming it. It also means the download survives navigating away.
 *
 * Counts are shown up front so nobody downloads a file to discover it is
 * empty, and a dataset with nothing in it says so instead of offering a
 * button that yields a lone header row.
 */
export function ExportDataCard({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="card p-6 sm:p-7">
      <h2 className="font-medium">Export your data</h2>
      <p className="mt-1 text-sm text-muted">
        Everything you put in, in CSV, ready for a spreadsheet or another tool. Downloads start
        immediately and nothing is stored anywhere new.
      </p>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {EXPORT_DATASETS.map((dataset) => {
          const info = DATASET_INFO[dataset];
          // Sending history has no cheap count: it is one row per person per
          // campaign, so it follows whether there are campaigns at all.
          const count = dataset === "recipients" ? counts.campaigns : counts[dataset];
          const empty = count === 0;
          return (
            <li key={dataset} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {info.label}
                  {typeof count === "number" && dataset !== "recipients" ? (
                    <span className="ml-2 text-xs font-normal text-muted">
                      {count.toLocaleString()}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">{info.description}</p>
              </div>
              {empty ? (
                <span className="text-xs text-muted">Nothing to export yet</span>
              ) : (
                <a
                  href={`/api/account/export?dataset=${dataset}`}
                  download
                  className="btn-secondary flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm"
                >
                  <Icon name="download" size={16} aria-hidden />
                  CSV
                </a>
              )}
            </li>
          );
        })}
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Settings</p>
            <p className="mt-0.5 text-xs text-muted">
              Campaign pacing, send windows, and tracking choices, as JSON.
            </p>
          </div>
          <a
            href="/api/account/export?dataset=settings"
            download
            className="btn-secondary flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm"
          >
            <Icon name="download" size={16} aria-hidden />
            JSON
          </a>
        </li>
      </ul>

      <p className="mt-4 text-xs text-muted">
        A large workspace can take a minute or two to finish downloading. Leave the tab open until
        the file lands.
      </p>
    </div>
  );
}

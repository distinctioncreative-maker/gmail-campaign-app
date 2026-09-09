"use client";

import type { SortState } from "@/lib/hooks/useSort";

/**
 * A sortable table header cell. Module-level (not defined inside a render) so
 * it keeps a stable identity. Shows an arrow for the active column and a
 * neutral arrow otherwise.
 *
 * The button carries its own height rather than borrowing the cell's padding.
 * A line of 16px text is not a target: WCAG 2.5.8 wants 24px, and the spacing
 * exception only rescues one when nothing else is near it, which held for six
 * of the seven headers on Campaigns and not for the narrow one. Sorting a
 * table is not a thing to have to aim at.
 */
export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
  className = "",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-6 ${active ? "text-foreground" : ""}`}
      >
        {label}
        <span className="text-3xs text-muted">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

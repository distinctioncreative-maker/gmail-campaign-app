"use client";

import type { SortState } from "@/lib/hooks/useSort";

/**
 * A sortable table header cell. Module-level (not defined inside a render) so
 * it keeps a stable identity. Shows an arrow for the active column and a
 * neutral ↕ otherwise.
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
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        <span className="text-3xs text-muted">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

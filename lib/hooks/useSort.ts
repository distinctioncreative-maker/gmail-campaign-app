"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * Small reusable client-side sort. Pass an accessor map (column key → value to
 * sort by). Clicking the same column flips direction. Strings sort
 * case-insensitively; numbers and nulls sort naturally (nulls last).
 */
export function useSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => string | number | null>,
  initial: SortState<K>
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const get = accessors[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls always last
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), undefined, { sensitivity: "base" }) * factor;
    });
  }, [rows, sort, accessors]);

  function toggle(key: K) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  return { sorted, sort, toggle };
}

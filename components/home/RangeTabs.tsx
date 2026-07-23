"use client";

import Link from "next/link";

const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "all", label: "All time" },
] as const;

export type HomeRange = (typeof RANGES)[number]["id"];

/** Segmented control that switches the Home KPIs between time windows via a
 * query param, without scrolling the page. */
export function RangeTabs({ active }: { active: HomeRange }) {
  return (
    <div className="segmented inline-flex">
      {RANGES.map((r) => (
        <Link
          key={r.id}
          href={`/home?range=${r.id}`}
          scroll={false}
          className={`seg-btn ${active === r.id ? "is-active" : ""}`}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}

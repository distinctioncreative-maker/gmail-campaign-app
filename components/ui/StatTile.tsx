import type { ReactNode } from "react";
import Link from "next/link";
import { type IconName } from "@/components/ui/Icon";

export type StatTone = "default" | "revenue" | "success" | "warning" | "danger" | "primary";

/**
 * Only two kinds of number on a screen may carry colour: money, and a genuine
 * problem. Everything else is ink. A grid where every figure is tinted has no
 * hierarchy, so it reads as decorated rather than designed.
 */
const TONE: Record<StatTone, string> = {
  default: "text-foreground",
  revenue: "text-revenue",
  success: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
  primary: "text-foreground",
};

/**
 * Up roughly a third across the board.
 *
 * The old ladder started at 26px, which is only twice the 13px body around it,
 * and that is the ratio at which a KPI stops reading as a headline and starts
 * reading as slightly-large text. The thing that makes a Robinhood tile feel
 * expensive is the gap between an enormous figure and a tiny label, not the
 * figure's absolute size.
 */
const VALUE_SIZE = {
  sm: "text-2xl",
  md: "text-3xl",
  lg: "text-4xl",
} as const;

export type StatTileProps = {
  label: string;
  value: ReactNode;
  /** Optional supporting line under the value. */
  hint?: string;
  tone?: StatTone;
  size?: keyof typeof VALUE_SIZE;
  /**
   * Accepted so call sites do not all need editing, but deliberately not
   * rendered. A decorative badge beside every figure is a large part of what
   * made this grid look like a toy.
   */
  icon?: IconName;
  href?: string;
};

/**
 * The figure a customer would screenshot for their boss.
 *
 * Set as a ruled cell rather than a floating card: hairline separation,
 * near-square corners, no shadow, no hover lift, no icon medallion. The number
 * and its label carry it. This is how printed financial reporting has always
 * handled a figure, and why it still reads as serious.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  href,
}: StatTileProps) {
  const body = (
    <>
      <p className="display-label leading-none">{label}</p>
      <p className={`display-figure mt-5 leading-none ${VALUE_SIZE[size]} ${TONE[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-3 text-xs leading-5 text-muted">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block bg-surface p-6 transition-colors duration-[--dur-base] hover:bg-surface-2">
        {body}
      </Link>
    );
  }
  return <div className="bg-surface p-6">{body}</div>;
}

/**
 * A ruled block of figures rather than a row of separate cards, so the group
 * reads as one table instead of several floating objects.
 *
 * The hairlines used to be drawn by a 1px grid gap over a border-coloured
 * ground. That is a common trick and it has a failure mode this page hit
 * squarely: the ground is only hidden where a child covers it, so any number of
 * children that does not exactly fill the last row leaves the rest of that row
 * showing as a bare grey slab. Home renders nine tiles into four columns, which
 * left a three-cell grey rectangle sitting under the numbers.
 *
 * Padding the children out to a multiple of the column count would fix that
 * instance and not the next one, because the column count changes at every
 * breakpoint. So the ground is gone entirely: the cells carry their own right
 * and bottom hairline, the grid is pulled 1px past its container on those two
 * edges, and the container clips the overhang. An incomplete final row now ends
 * where the content ends, at any child count and any breakpoint.
 */
export function StatGrid({
  columns = 4,
  children,
}: {
  columns?: 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  const cols: Record<number, string> = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div
        className={`-mb-px -mr-px grid [&>*]:border-b [&>*]:border-r [&>*]:border-border ${cols[columns]}`}
      >
        {children}
      </div>
    </div>
  );
}

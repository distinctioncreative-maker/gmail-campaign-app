import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

export type StatTone = "default" | "revenue" | "success" | "warning" | "danger" | "primary";

/**
 * Tone drives both the number and its icon chip, so a tile only ever needs to
 * say what it means. Before this, each page picked its own text colour and its
 * own chip background, which is why no two stat rows in the app matched.
 */
const TONE: Record<StatTone, { value: string; chip: string }> = {
  default: { value: "text-foreground", chip: "bg-surface-2 text-muted" },
  // Money moments only, per docs/brand.md: the revenue accent loses its meaning
  // if it is used for every number on the page.
  revenue: { value: "text-revenue", chip: "bg-revenue-soft text-revenue" },
  success: { value: "text-success", chip: "bg-success-soft text-success" },
  warning: { value: "text-warning", chip: "bg-warning-soft text-warning" },
  danger: { value: "text-danger", chip: "bg-danger-soft text-danger" },
  primary: { value: "text-primary", chip: "bg-primary-soft text-primary" },
};

const VALUE_SIZE = {
  sm: "text-2xl",
  md: "text-[2rem]",
  lg: "text-[2.5rem]",
} as const;

export type StatTileProps = {
  label: string;
  value: ReactNode;
  /** Optional supporting line under the value. */
  hint?: string;
  tone?: StatTone;
  size?: keyof typeof VALUE_SIZE;
  /** Line icon shown as a soft chip beside the label. */
  icon?: IconName;
  /** Turns the whole tile into a link and reveals a "View" affordance on hover. */
  href?: string;
};

/**
 * The number a customer would screenshot for their boss.
 *
 * Nineteen of these were hand-built across thirteen pages with slightly
 * different type sizes, chip colours, and spacing, which is a large part of
 * why the app read as unpolished. One component now owns the treatment:
 * display face, tight tracking, tabular figures so digits do not jitter as
 * values update, and a restrained hover lift.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  icon,
  href,
}: StatTileProps) {
  const t = TONE[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-medium leading-tight text-muted">{label}</p>
        {icon && (
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${t.chip} transition-transform duration-[--dur-base] ease-[--ease-out] group-hover:scale-110`}
          >
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <p
        className={`mt-2.5 font-display font-bold leading-none tabular-nums tracking-[-0.03em] ${VALUE_SIZE[size]} ${t.value}`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>}
      {href && (
        <span className="mt-2 flex items-center gap-1 text-xs font-medium text-muted/70 opacity-0 transition-[opacity,color] duration-[--dur-base] group-hover:text-primary group-hover:opacity-100">
          View
          <span aria-hidden className="transition-transform duration-[--dur-base] ease-[--ease-out] group-hover:translate-x-0.5">
            →
          </span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-hover group block p-5">
        {body}
      </Link>
    );
  }
  return <div className="card card-hover group p-5">{body}</div>;
}

/**
 * Consistent responsive grid for a row of stat tiles, with the shared
 * staggered entrance so a dashboard resolves rather than snapping in.
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
  return <div className={`stagger grid gap-3 ${cols[columns]}`}>{children}</div>;
}

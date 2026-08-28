import type { ReactNode } from "react";

/**
 * The shell every data table in the product shares, and nothing more.
 *
 * Nineteen files hand-roll a table. The measured duplication is not in the
 * columns, which differ everywhere and should, but in the chrome around them:
 * `<table className="w-full text-left text-sm">` appears fifteen times
 * identically, the same `<thead>` classes fourteen times, and the same row
 * border-and-hover string seven times. That is the part worth owning.
 *
 * What this deliberately does not do is take a column config. A `columns={[…]}`
 * API is the obvious next step and it is the wrong one here: these tables carry
 * sortable headers, checkbox selection, inline meters, action menus, per-row
 * links and colspan empty states, and every one of those becomes a render-prop
 * escape hatch. The abstraction ends up larger than the nineteen tables it
 * replaced and harder to read than any of them. Duplicated markup is cheaper
 * than a wrong abstraction, so this owns styling and leaves structure alone.
 *
 * `head` takes the contents of the header row rather than an array of strings,
 * so a sortable `<SortTh>` or a bare `<th />` spacer for an actions column keeps
 * working without this component knowing they exist.
 */
export function DataTable({
  head,
  children,
  /** Minimum width before the wrapper scrolls, for tables with many columns. */
  minWidth,
  className = "",
}: {
  head: ReactNode;
  children: ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    // Wide tables scroll inside their own container so the page body never
    // scrolls sideways, which is the failure this wrapper exists to prevent.
    <div className={`overflow-x-auto ${className}`}>
      <table
        className="w-full text-left text-sm"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A body row. `last:border-0` matters more than it looks: without it the final
 * row draws a rule against the card's own bottom edge, which reads as a
 * misaligned double border rather than as a table that ends.
 */
export function TableRow({
  children,
  interactive = true,
  className = "",
}: {
  children: ReactNode;
  /** Set false for rows that are not clickable, so hover does not imply they are. */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={`border-b border-border last:border-0 ${
        interactive ? "transition-colors duration-(--dur-fast) hover:bg-surface-2" : ""
      } ${className}`}
    >
      {children}
    </tr>
  );
}

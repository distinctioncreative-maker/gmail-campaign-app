import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The shell every data table in the product shares, and nothing more.
 *
 * Nineteen files hand-rolled a table. The measured duplication is not in the
 * columns, which differ everywhere and should, but in the chrome around them:
 * `<table className="w-full text-left text-sm">` appeared fifteen times
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
 *
 * The three optional props below are chrome, not structure, which is why they
 * are here and a column config is not. Each one was the recorded reason a real
 * table stayed hand-rolled: a label-and-value list with no header row, a long
 * list whose header has to stay visible, and a body that staggers its rows in.
 */
export function DataTable({
  head,
  children,
  /** Minimum width before the wrapper scrolls, for tables with many columns. */
  minWidth,
  /**
   * Keeps the header visible while the body scrolls. Needs `maxHeight` to do
   * anything: without a scroll container there is nothing to stick to.
   */
  stickyHeader = false,
  /** Caps the scroll container, e.g. "32rem". */
  maxHeight,
  className = "",
  bodyClassName = "",
}: {
  head?: ReactNode;
  children: ReactNode;
  minWidth?: string;
  stickyHeader?: boolean;
  maxHeight?: string;
  className?: string;
  bodyClassName?: string;
}) {
  /**
   * Wide tables scroll inside their own container so the page body never
   * scrolls sideways, which is the failure this wrapper exists to prevent.
   *
   * The exception is a sticky header with no maxHeight of its own. `overflow-x:
   * auto` forces the computed `overflow-y` to `auto` as well, which makes this
   * div the nearest scroll container, and a header sticking to a container that
   * never scrolls does nothing at all. So that combination means the caller
   * already owns the scrolling element and this one stays out of the way.
   */
  const scroll = maxHeight
    ? "overflow-auto"
    : stickyHeader
      ? ""
      : "overflow-x-auto";

  return (
    <div
      className={`${scroll} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        className="w-full text-left text-sm"
        style={minWidth ? { minWidth } : undefined}
      >
        {head ? (
          <thead
            className={`border-b border-border text-xs uppercase text-muted ${
              // The header needs its own background once it floats, or the rows
              // scroll through it.
              stickyHeader ? "sticky top-0 z-10 bg-surface" : ""
            }`}
          >
            <tr>{head}</tr>
          </thead>
        ) : null}
        <tbody className={bodyClassName || undefined}>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A body row. `last:border-0` matters more than it looks: without it the final
 * row draws a rule against the card's own bottom edge, which reads as a
 * misaligned double border rather than as a table that ends.
 *
 * Extra props pass through to the `<tr>`. That is what lets a row carry the
 * `data-*` attributes a keyboard-navigation script reads, which is the thing
 * that had kept the replies table hand-rolled and this component at zero
 * importers.
 */
export function TableRow({
  children,
  interactive = true,
  className = "",
  ...rest
}: {
  children: ReactNode;
  /** Set false for rows that are not clickable, so hover does not imply they are. */
  interactive?: boolean;
} & ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      className={`border-b border-border last:border-0 ${
        interactive ? "transition-colors duration-(--dur-fast) hover:bg-surface-2" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </tr>
  );
}

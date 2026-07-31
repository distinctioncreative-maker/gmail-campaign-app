import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The single page header for every dashboard screen: optional back link,
 * title, optional one-line description, and an optional action slot.
 *
 * Detail and "new" screens used to hand-roll a back link plus their own
 * <h1>, which drifted into ten different type treatments and made the app
 * read as several products stitched together. Everything routes through
 * here so size, weight, tracking, and spacing stay identical.
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Renders a subtle back link above the title. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-7 border-b border-border/70 pb-5">
      {backHref && (
        <Link
          href={backHref}
          className="group mb-2.5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <span
            aria-hidden
            className="transition-transform duration-200 group-hover:-translate-x-0.5"
          >
            ←
          </span>
          {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export type EntityMeta = {
  label: string;
  value: ReactNode;
};

/**
 * The header for a screen about one thing, as opposed to a screen listing many.
 *
 * Every detail route in the app rendered the same `PageHeader` an index route
 * did: a back link, an h1, and sometimes a sentence. So a campaign mid-send, a
 * lead who has replied twice, and a draft template all opened identically, and
 * the only way to learn which one you were looking at, or what state it was in,
 * was to read down the page. Twenty-eight of thirty screens sharing one shape is
 * the measured reason this app reads as plain, and undifferentiated headers are
 * the most visible part of it.
 *
 * Three things this adds that a title alone cannot.
 *
 * **The type is named.** A small kicker above the title says Campaign, Lead,
 * Template. On a screen reached from a search result or a shared link, that is
 * the difference between orienting instantly and reading to find out.
 *
 * **State is in the header, not buried.** A campaign that is paused, a lead who
 * has opted out, a sequence that is live: these change what the reader should do
 * next, so they belong beside the name rather than three sections down. The
 * status is a badge, so it reads as state at a glance rather than as prose.
 *
 * **The facts you would ask first are inline.** Created when, last active when,
 * how many recipients. A row of small label-and-value pairs answers those
 * without spending a card on each, which is what the stat grid was being misused
 * for on screens that only had three facts to show.
 *
 * `PageHeader` stays exactly as it is and remains correct for index screens.
 * This is a second archetype, not a replacement: the point is that the two kinds
 * of screen should not look the same.
 */
export function EntityHeader({
  kicker,
  title,
  status,
  meta = [],
  actions,
  backHref,
  backLabel,
  description,
}: {
  /** What kind of thing this is: "Campaign", "Lead", "Template". */
  kicker: string;
  title: string;
  /** Pre-classed badge, so each domain keeps ownership of its own status names. */
  status?: { label: string; className: string };
  meta?: EntityMeta[];
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  description?: string;
}) {
  return (
    <div className="mb-9 border-b border-border pb-6">
      {backHref && (
        <Link
          href={backHref}
          className="group mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <span
            aria-hidden
            className="transition-transform duration-[--dur-base] group-hover:-translate-x-0.5"
          >
            <Icon name="arrowLeft" size={15} />
          </span>
          {backLabel ?? "Back"}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="display-label">{kicker}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Breaks on a long name rather than truncating it: a campaign called
                "07/22 A2C + NL Blast" clipped to "07/22 A2C + NL..." is a name
                that no longer identifies anything. */}
            <h1 className="min-w-0 break-words text-[1.9375rem] leading-[1.12] text-foreground">
              {title}
            </h1>
            {status && <span className={`badge ${status.className}`}>{status.label}</span>}
          </div>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {meta.length > 0 && (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[0.6875rem] font-medium uppercase leading-none tracking-[0.09em] text-muted">
                {item.label}
              </dt>
              <dd className="mt-1.5 text-sm text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

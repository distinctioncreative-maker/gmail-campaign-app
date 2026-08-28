import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  /** Optional lower-emphasis second path, usually "learn how this works". */
  secondaryAction?: { href: string; label: string };
  /**
   * "page" is the full branded moment for a surface a customer has not used
   * yet. "inline" is the quiet one-liner for a sub-panel inside a page that
   * already has content of its own.
   */
  variant?: "page" | "inline";
  className?: string;
}

/**
 * The first thing a new customer sees on most surfaces, which makes it a
 * brand moment rather than a fallback. The medallion sits in a soft halo so
 * the panel has a focal point, and the title uses the display face so an
 * empty page still looks like the same product as a full one.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "page",
  className = "",
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div className={`card flex flex-col items-center gap-2 px-6 py-8 text-center ${className}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-muted">
          <Icon name={icon} size={17} />
        </span>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm leading-6 text-muted">{description}</p>}
        {action && (
          <Link href={action.href} className="mt-1 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            {action.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      className={`card animate-rise relative overflow-hidden px-6 py-14 text-center sm:px-10 ${className}`}
    >
      {/* Soft brand halo behind the medallion, so the panel has a centre of gravity. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-2 blur-3xl"
      />
      <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-surface-2 text-foreground ring-1 ring-border">
        <Icon name={icon} size={24} />
      </span>
      <p className="relative mt-5 display-title text-lg">{title}</p>
      {description && (
        <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <Link href={action.href} className="btn-primary px-5 py-2.5 text-sm">
              {action.label}
            </Link>
          )}
          {secondaryAction && (
            <Link href={secondaryAction.href} className="btn-ghost px-5 py-2.5 text-sm">
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

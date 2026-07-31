import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}

/** Shared "nothing here yet" panel: icon, plain-language title/description,
 * and an optional primary CTA. Used for a page's first-ever empty state, not
 * small in-page sub-panels (those stay a plain muted line). */
export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`card animate-rise px-6 py-12 text-center sm:px-10 ${className}`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-primary/10 bg-primary-soft text-primary">
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">{description}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-5 px-5 py-2.5 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  );
}

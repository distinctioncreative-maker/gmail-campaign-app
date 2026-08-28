"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Logo";
import { MobileNav } from "@/components/MobileNav";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Optional grouping label; consecutive items sharing one render under a
   * single small heading in the sidebar. */
  section?: string;
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" aria-label="Main">
      <div className="flex flex-col gap-0.5">
      {items.map((item, i) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const showHeading = Boolean(item.section) && item.section !== items[i - 1]?.section;
        return (
          <div key={`${item.href}-wrap`} className="contents">
          {showHeading && (
            <p className="px-3 pb-1 pt-4 text-3xs font-semibold uppercase tracking-wider text-muted first:pt-1">
              {item.section}
            </p>
          )}
          <Link
            href={item.href}
            onClick={onNavigate}
            data-tour={`nav-${item.href.replace("/", "")}`}
            aria-current={active ? "page" : undefined}
            className={`group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-surface-2 text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="brand-gradient absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full"
              />
            )}
            <Icon
              name={item.icon}
              size={18}
              className={`shrink-0 transition ${active ? "" : "opacity-60 group-hover:opacity-100"}`}
            />
            {item.label}
          </Link>
          </div>
        );
      })}
      </div>
    </nav>
  );
}

function Brand({ workspaceName }: { workspaceName?: string }) {
  return (
    <div className="px-2">
      <Wordmark />
      {workspaceName && (
        <p className="mt-2 truncate text-2xs font-medium text-muted">
          {workspaceName}
        </p>
      )}
    </div>
  );
}

export function Sidebar({
  items,
  displayName,
  email,
  role,
  roleLabel,
  workspaceName,
}: {
  items: NavItem[];
  displayName: string;
  email: string;
  role: string;
  roleLabel?: string | null;
  workspaceName?: string;
}) {
  return (
    <>
      {/* Desktop sidebar. Navigation only: the account menu now lives in the
          top bar, because a popover anchored outside this aside was clipped
          by the overflow rule that keeps the nav scrolling inside it. */}
      <aside className="glass sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-border p-4 sm:flex">
        <div className="mb-3 mt-1 shrink-0 border-b border-border/70 pb-4">
          <Brand workspaceName={workspaceName} />
        </div>
        <NavLinks items={items} />
      </aside>

      {/* Mobile bottom tab bar + More sheet */}
      <MobileNav items={items} displayName={displayName} email={email} role={role} roleLabel={roleLabel} />
    </>
  );
}

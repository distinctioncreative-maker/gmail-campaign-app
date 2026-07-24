"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AccountMenu } from "@/components/AccountMenu";
import { Logo } from "@/components/ui/Logo";
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
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item, i) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const showHeading = Boolean(item.section) && item.section !== items[i - 1]?.section;
        return (
          <div key={`${item.href}-wrap`} className="contents">
          {showHeading && (
            <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:pt-1">
              {item.section}
            </p>
          )}
          <Link
            href={item.href}
            onClick={onNavigate}
            data-tour={`nav-${item.href.replace("/", "")}`}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-primary-soft text-primary shadow-sm"
                : "text-slate-500 hover:bg-white hover:text-slate-900"
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
    </nav>
  );
}

function Brand({ workspaceName }: { workspaceName?: string }) {
  return (
    <div className="px-2">
      <Logo size={26} />
      {workspaceName && (
        <p className="mt-1.5 truncate text-[11px] font-medium uppercase tracking-widest text-slate-400">
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
  workspaceName,
}: {
  items: NavItem[];
  displayName: string;
  email: string;
  role: string;
  workspaceName?: string;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border p-4 sm:flex">
        <div className="mb-7 mt-1">
          <Brand workspaceName={workspaceName} />
        </div>
        <NavLinks items={items} />
        <div className="mt-auto">
          <AccountMenu displayName={displayName} email={email} role={role} />
        </div>
      </aside>

      {/* Mobile bottom tab bar + More sheet */}
      <MobileNav items={items} displayName={displayName} email={email} role={role} />
    </>
  );
}

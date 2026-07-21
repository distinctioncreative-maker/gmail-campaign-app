"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AccountMenu } from "@/components/AccountMenu";
import { Logo } from "@/components/ui/Logo";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
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
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-2">
      <Logo size={26} />
    </div>
  );
}

export function Sidebar({
  items,
  displayName,
  email,
  role,
}: {
  items: NavItem[];
  displayName: string;
  email: string;
  role: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border p-4 sm:flex">
        <div className="mb-7 mt-1">
          <Brand />
        </div>
        <NavLinks items={items} />
        <div className="mt-auto">
          <AccountMenu displayName={displayName} email={email} role={role} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur sm:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden className="text-lg">☰</span>
        </button>
        <Brand />
        <NotificationBell />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 sm:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <Brand />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto">
              <AccountMenu displayName={displayName} email={email} role={role} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

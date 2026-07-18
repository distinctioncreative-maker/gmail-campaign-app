"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/NotificationBell";
import { SignOutButton } from "@/components/SignOutButton";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
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
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-primary-soft text-primary"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span aria-hidden className="text-base leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-white shadow-sm"
      >
        O
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-900">Outreach</span>
    </div>
  );
}

export function Sidebar({
  items,
  displayName,
  role,
}: {
  items: NavItem[];
  displayName: string;
  role: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-white/70 p-4 backdrop-blur sm:flex">
        <div className="mb-6 mt-1">
          <Brand />
        </div>
        <NavLinks items={items} />
        <div className="mt-auto rounded-xl border border-border bg-white p-3">
          <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
          <p className="text-xs capitalize text-slate-500">{role.replace("_", " ").toLowerCase()}</p>
          <SignOutButton />
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
            <div className="mt-auto rounded-xl border border-border bg-white p-3">
              <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
              <p className="text-xs capitalize text-slate-500">
                {role.replace("_", " ").toLowerCase()}
              </p>
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

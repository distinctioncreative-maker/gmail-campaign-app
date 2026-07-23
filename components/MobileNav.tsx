"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccountMenu } from "@/components/AccountMenu";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Hrefs pinned to the bottom bar; everything else lives in the More sheet. */
const PRIMARY = ["/home", "/campaigns", "/replies", "/leads"];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Native-app mobile navigation: a fixed bottom tab bar for the four core
 * destinations plus a slide-up "More" sheet with the rest, theme toggle, and
 * account. Hidden on sm+ (desktop uses the sidebar).
 */
export function MobileNav({
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
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const primary = PRIMARY.map((href) => items.find((i) => i.href === href)).filter(
    (i): i is NavItem => Boolean(i)
  );
  const rest = items.filter((i) => !PRIMARY.includes(i.href));
  const moreActive = rest.some((i) => isActive(pathname, i.href));

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium"
            >
              {active && (
                <span aria-hidden className="brand-gradient absolute top-0 h-0.5 w-8 rounded-full" />
              )}
              <Icon
                name={item.icon}
                size={22}
                className={`transition ${active ? "text-primary" : "text-slate-400"}`}
              />
              <span className={active ? "text-primary" : "text-slate-500"}>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          aria-expanded={moreOpen}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium"
        >
          {(moreOpen || moreActive) && (
            <span aria-hidden className="brand-gradient absolute top-0 h-0.5 w-8 rounded-full" />
          )}
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
            className={moreOpen || moreActive ? "text-primary" : "text-slate-400"}
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
          <span className={moreOpen || moreActive ? "text-primary" : "text-slate-500"}>More</span>
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="More menu">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-[rise_0.2s_ease]"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)", animation: "rise 0.26s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-500">Menu</h2>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {rest.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-xs font-medium transition ${
                      active
                        ? "border-primary/30 bg-primary-soft text-primary"
                        : "border-border text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon name={item.icon} size={20} className={active ? "text-primary" : "text-slate-400"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-border p-2 pl-4">
              <span className="text-sm text-slate-600">Appearance</span>
              <ThemeToggle />
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <AccountMenu displayName={displayName} email={email} role={role} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
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
  roleLabel,
}: {
  items: NavItem[];
  displayName: string;
  email: string;
  role: string;
  roleLabel?: string | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    const trigger = moreTriggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
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
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium"
            >
              {active && (
                <span aria-hidden className="brand-gradient absolute top-0 h-0.5 w-8 rounded-full" />
              )}
              <Icon
                name={item.icon}
                size={22}
                className={`transition ${active ? "text-primary" : "text-muted"}`}
              />
              <span className={active ? "text-primary" : "text-muted"}>{item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreTriggerRef}
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium"
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
            className={moreOpen || moreActive ? "text-primary" : "text-muted"}
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
          <span className={moreOpen || moreActive ? "text-primary" : "text-muted"}>More</span>
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="More menu">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-[rise_0.2s_ease]"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div
            ref={sheetRef}
            id="mobile-more-menu"
            className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[1.25rem] border-t border-border bg-surface p-5 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)", animation: "rise 0.26s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Menu</h2>
              <button
                ref={closeRef}
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
            <div className="grid grid-cols-2 gap-2.5 min-[380px]:grid-cols-3">
              {rest.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition ${
                      active
                        ? "border-primary/30 bg-primary-soft text-primary"
                        : "border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    <Icon name={item.icon} size={20} className={active ? "text-primary" : "text-muted"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-border p-2 pl-4">
              <span className="text-sm text-muted">Appearance</span>
              <ThemeToggle />
            </div>
            </div>

            <div className="shrink-0 border-t border-border pt-4">
              <AccountMenu displayName={displayName} email={email} role={role} roleLabel={roleLabel} placement="sheet" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

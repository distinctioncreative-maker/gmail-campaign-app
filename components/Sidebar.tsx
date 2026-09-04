"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark, LogoMark } from "@/components/ui/Logo";
import { MobileNav } from "@/components/MobileNav";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Optional grouping label; consecutive items sharing one render under a
   * single small heading in the sidebar. */
  section?: string;
}

export const RAIL_STORAGE_KEY = "massleader.rail";

/**
 * Collapsed state lives on the document element, set before paint by the same
 * script that sets the theme, and the width is done entirely in CSS.
 *
 * Holding it in React state instead would mean the server rendering an
 * expanded rail, the client correcting it in an effect, and every visitor who
 * collapsed it watching it collapse again on every navigation. Reading
 * localStorage during render is not available either: the server has none, so
 * it is a hydration mismatch on every page in the app.
 *
 * The consequence is that nothing here branches on collapsed at all. Both
 * states are rendered and CSS chooses, which is also why the transition can be
 * a width transition rather than a swap.
 */
function toggleRail() {
  const root = document.documentElement;
  const next = root.dataset.rail === "collapsed" ? "expanded" : "collapsed";
  root.dataset.rail = next;
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, next);
  } catch {
    // Preference is lost on reload; the rail still works for this session.
  }
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
                <>
                  <p className="rail-label px-3 pb-1 pt-4 text-3xs font-semibold uppercase tracking-wider text-muted first:pt-1">
                    {item.section}
                  </p>
                  {/* A heading with no room for its word becomes a rule. The
                      grouping survives the collapse; the label need not.

                      Only between groups: a divider above the first item
                      divides it from the wordmark, which the head's own border
                      already does, and two hairlines eight pixels apart is how
                      a rail starts looking like a form. `:first-child` cannot
                      express this, because each item sits in its own `contents`
                      wrapper and the rule is never the first child of it. */}
                  {i > 0 && (
                    <hr aria-hidden className="rail-rule mx-2 my-2 border-t border-border" />
                  )}
                </>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                data-tour={`nav-${item.href.replace("/", "")}`}
                aria-current={active ? "page" : undefined}
                className={`rail-item group relative flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
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
                {/* Visible when expanded, and read aloud in both states: a
                    collapsed rail is icons to the eye, never to a screen
                    reader. */}
                <span className="rail-label">{item.label}</span>
                <span className="rail-sr-label sr-only">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function Sidebar({
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
  return (
    <>
      {/* Desktop rail. Navigation only: the account menu lives in the top bar,
          because a popover anchored outside this aside was clipped by the
          overflow rule that keeps the nav scrolling inside it.

          The workspace name used to sit under the wordmark here, and again in
          the top bar, and a third time in the greeting on /home, at three
          sizes in three colours. It lives in the breadcrumb now and nowhere
          else. */}
      <aside className="rail glass sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-border py-4 sm:flex">
        <div className="rail-head mb-3 mt-1 flex shrink-0 items-center border-b border-border pb-4">
          <span className="rail-label">
            <Wordmark />
          </span>
          <span className="rail-mark">
            <LogoMark size={22} />
          </span>
          <button
            onClick={toggleRail}
            /* One control, not two. Its label is written in CSS-independent
               terms because the DOM cannot know which state it is in without
               the React state this deliberately does not keep. */
            aria-label="Toggle navigation width"
            className="rail-toggle rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <Icon name="chevronDown" size={16} className="rail-chevron" />
          </button>
        </div>

        <NavLinks items={items} />
      </aside>

      {/* Mobile bottom tab bar + More sheet */}
      <MobileNav items={items} displayName={displayName} email={email} role={role} roleLabel={roleLabel} />
    </>
  );
}

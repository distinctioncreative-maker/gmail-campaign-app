"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/components/Sidebar";

/**
 * Where you are, in the top bar, once.
 *
 * The workspace name was rendered three times above the fold on /home: in the
 * sidebar under the wordmark at 11px muted, in the top bar at 14px medium
 * foreground, and again inside the greeting pill. Three type treatments of one
 * string, none of them agreeing, which is a large part of why the chrome read
 * as assembled rather than designed. It has one home now, and this is it.
 *
 * It is derived from the pathname and the nav the user actually has, rather
 * than assembled by each page. A breadcrumb that every screen has to remember
 * to set is a breadcrumb that is wrong on the screens nobody revisited.
 *
 * It deliberately stops at the section and does not name the individual record.
 * The page's own h1 already says which campaign you are looking at, in type
 * sized to be read; repeating it up here in 13px would be the fourth copy of a
 * string, which is the exact problem this component exists to remove. So the
 * trail answers "where am I" and the heading answers "what is this", and
 * neither says the other's sentence.
 */
export function Breadcrumb({
  workspaceName,
  items,
  homeHref = "/home",
}: {
  workspaceName: string;
  items: NavItem[];
  homeHref?: string;
}) {
  const pathname = usePathname();

  // Longest matching href wins, so /campaigns/new resolves to Campaigns rather
  // than to whichever nav entry happened to be declared first.
  const current = items
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const onIndex = current ? pathname === current.href : false;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="min-w-0 shrink">
          <Link
            href={homeHref}
            className="block truncate rounded-sm text-muted transition-colors hover:text-foreground"
          >
            {workspaceName || "Workspace"}
          </Link>
        </li>
        {current && (
          <>
            <li aria-hidden className="shrink-0 text-border-firm">
              /
            </li>
            <li className="min-w-0 shrink-0">
              {onIndex ? (
                <span className="truncate font-medium text-foreground" aria-current="page">
                  {current.label}
                </span>
              ) : (
                // Deeper than the index, so the section becomes the way back up.
                // This is the same destination the in-page back link offers,
                // which is why it can be a link rather than dead text.
                <Link
                  href={current.href}
                  className="truncate rounded-sm text-muted transition-colors hover:text-foreground"
                >
                  {current.label}
                </Link>
              )}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

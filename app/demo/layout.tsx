import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { UIProviders } from "@/components/ui/UIProviders";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { demoEnabled } from "@/lib/demo/enabled";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const metadata: Metadata = {
  title: "Product tour",
  // The tour is a sales surface, not a page anyone should land on from search
  // expecting the real product.
  robots: { index: false, follow: false },
};

const DEMO_NAV: NavItem[] = [
  { href: "/demo", label: "Home", icon: "home", section: "Overview" },
  { href: "/demo/campaigns", label: "Campaigns", icon: "rocket", section: "Outreach" },
  { href: "/demo/replies", label: "Replies", icon: "check", section: "Outreach" },
  { href: "/demo/leads", label: "Leads", icon: "users", section: "Audience & content" },
  { href: "/demo/reports", label: "Reports", icon: "chart", section: "Insights" },
];

/**
 * Signed-out product tour.
 *
 * This route group deliberately never calls `requireUser()`, never opens a
 * Firestore handle, and never reaches Gmail or Stripe. It renders the same
 * components the real dashboard renders, against the fixtures in
 * lib/demo/fixtures.ts. Keeping it structurally separate is the point: there
 * is no code path here that could be widened into a way into a real workspace.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoEnabled()) notFound();

  return (
    <UIProviders>
      <div className="flex min-h-screen">
        <Sidebar
          items={DEMO_NAV}
          displayName="Alex Rivera"
          email="alex@northwindpartners.com"
          role="ADMIN"
          roleLabel="Administrator"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Same 56px rule as the real dashboard, so the tour reads as the
              product rather than as a mock of it. */}
          <header className="glass sticky top-0 z-chrome flex h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
            {/* The same breadcrumb the real dashboard carries, for the same
                reason the rule below it is the same 56px: this should read as
                the product rather than as a mock of it. */}
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden min-w-0 sm:block">
                <Breadcrumb
                  workspaceName="Northwind Partners"
                  items={DEMO_NAV}
                  homeHref="/demo"
                />
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted">
                <Icon name="sparkles" size={14} aria-hidden />
                <span className="hidden md:inline">
                  Product tour with sample data. Nothing here sends email.
                </span>
                <span className="md:hidden">Sample data</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/" className="btn-ghost px-3 py-1.5 text-xs">
                Back to site
              </Link>
              <Link href="/sign-in" className="btn-primary px-3.5 py-1.5 text-xs">
                Get started
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-28 sm:p-6 sm:pb-6 md:p-10">
            <div className="animate-rise">{children}</div>
          </main>
        </div>
      </div>
    </UIProviders>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import type { TenantType } from "@/schemas/user";
import { getOrganization, getOrgSettings } from "@/lib/repositories/orgSettings";
import { resolveSendingState } from "@/lib/sending/mode";
import { NotificationBell } from "@/components/NotificationBell";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { ProductTour } from "@/components/tour/ProductTour";
import { UIProviders } from "@/components/ui/UIProviders";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";

const BASE_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home", section: "Overview" },
  { href: "/campaigns", label: "Campaigns", icon: "rocket", section: "Outreach" },
  { href: "/replies", label: "Replies", icon: "check", section: "Outreach" },
  { href: "/leads", label: "Leads", icon: "users", section: "Audience & content" },
  { href: "/templates", label: "Templates", icon: "mail", section: "Audience & content" },
  { href: "/sequences", label: "Follow-Ups", icon: "repeat", section: "Audience & content" },
  { href: "/suppressions", label: "Do Not Email", icon: "ban", section: "Audience & content" },
  { href: "/reports", label: "Reports", icon: "chart", section: "Insights" },
  { href: "/deliverability", label: "Deliverability", icon: "shield", section: "Insights" },
  { href: "/settings", label: "Settings", icon: "settings", section: "Workspace" },
  { href: "/help", label: "Help", icon: "help", section: "Workspace" },
];

const MANAGER_NAV: NavItem[] = [{ href: "/team", label: "Team", icon: "team", section: "Team" }];
const ADMIN_NAV: NavItem[] = [
  { href: "/team", label: "Team", icon: "team", section: "Admin" },
  { href: "/admin", label: "Administration", icon: "admin", section: "Admin" },
  { href: "/system-health", label: "System Health", icon: "health", section: "Admin" },
];

function navFor(role: string, caps: { teams: boolean; adminConsole: boolean }): NavItem[] {
  // Solo (consumer) tenants have no team/admin surfaces even though they are
  // the sole admin of their own private workspace.
  if (role === "ADMIN" && caps.adminConsole) return [...BASE_NAV, ...ADMIN_NAV];
  if (role === "MANAGER" && caps.teams) return [...BASE_NAV, ...MANAGER_NAV];
  return BASE_NAV;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let displayName: string;
  let email: string;
  let role: string;
  let organizationId: string;
  let tenantType: TenantType;
  try {
    const ctx = await requireUser();
    displayName = ctx.user.displayName;
    email = ctx.email;
    role = ctx.role;
    organizationId = ctx.organizationId;
    tenantType = ctx.tenantType;
  } catch {
    // Send signed-out visitors (and brand-new users hitting a bookmarked
    // app URL) to the marketing site first, not straight to a bare login
    // form — "/" already redirects signed-in sessions on to /home, so this
    // never traps an authenticated user.
    redirect("/");
  }

  const [sending, org, settings] = await Promise.all([
    resolveSendingState(organizationId),
    getOrganization(organizationId),
    getOrgSettings(organizationId),
  ]);
  const nav = navFor(
    role,
    capabilitiesFor(tenantType, settings.billing.plan)
  );
  const workspaceName = org?.name ?? "";

  return (
    <UIProviders>
    <div className="flex min-h-screen">
      <Sidebar
        items={nav}
        displayName={displayName}
        email={email}
        role={role}
        workspaceName={workspaceName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar: full-width identity + theme + notifications.
            Lives inside the content column (not the flex row) so it never
            steals horizontal space from the page. */}
        <header className="glass sticky top-0 z-20 flex items-center justify-between border-b border-border px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            {workspaceName && (
              <span className="max-w-[9rem] truncate text-[11px] font-medium uppercase tracking-widest text-muted/70">
                {workspaceName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        {/* Always-visible sending-mode banner so no one is ever unsure. */}
        {sending.testMode ? (
          <div className="alert-warning flex items-center justify-center gap-2 border-y px-4 py-1.5 text-center text-xs font-medium text-warning">
            <span aria-hidden>🛡️</span>
            Test mode — emails only go to your test address, never real recipients.
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
            <span aria-hidden>●</span>
            Live — campaigns send real emails to real recipients.
          </div>
        )}
        <div className="glass sticky top-0 z-10 hidden items-center justify-end gap-1 border-b border-border px-6 py-2.5 sm:flex">
          <ThemeToggle />
          <NotificationBell />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-28 sm:p-6 sm:pb-6 md:p-8">
          <div className="animate-rise">{children}</div>
        </main>
      </div>
      <ProductTour />
    </div>
    </UIProviders>
  );
}

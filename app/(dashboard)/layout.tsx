import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import type { TenantType } from "@/schemas/user";
import { getOrganization, getOrgSettings } from "@/lib/repositories/orgSettings";
import { getPlatformSettings } from "@/lib/platform/state";
import { resolveSendingState } from "@/lib/sending/mode";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { ProductTour } from "@/components/tour/ProductTour";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { UIProviders } from "@/components/ui/UIProviders";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Wordmark } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";

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
  let roleLabel: string | null;
  let organizationId: string;
  let tenantType: TenantType;
  let onboardingComplete: boolean;
  try {
    const ctx = await requireUser();
    displayName = ctx.user.displayName;
    email = ctx.email;
    role = ctx.role;
    roleLabel = ctx.roleLabel;
    organizationId = ctx.organizationId;
    tenantType = ctx.tenantType;
    onboardingComplete = ctx.user.onboardingStatus === "COMPLETE";
  } catch {
    // Send signed-out visitors (and brand-new users hitting a bookmarked
    // app URL) to the marketing site first, not straight to a bare login
    // form: "/" already redirects signed-in sessions on to /home, so this
    // never traps an authenticated user.
    redirect("/");
  }

  const [sending, org, settings, platform] = await Promise.all([
    resolveSendingState(organizationId),
    getOrganization(organizationId),
    getOrgSettings(organizationId),
    // Cached for fifteen seconds, so this is not a read per page view.
    getPlatformSettings(),
  ]);
  const capabilities = capabilitiesFor(tenantType, settings.billing.plan);
  const nav = navFor(role, capabilities);
  const workspaceName = org?.name ?? "";

  return (
    <UIProviders>
    <a
      href="#dashboard-main"
      className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-surface px-4 py-3 text-sm font-semibold text-foreground shadow-lg transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      Skip to main content
    </a>
    <div className="flex min-h-screen">
      <Sidebar
        items={nav}
        displayName={displayName}
        email={email}
        role={role}
        roleLabel={roleLabel}
        workspaceName={workspaceName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* One bar. This used to be three stacked strips: a mobile identity
            header, a full-width coloured sending-mode band, and a desktop
            toolbar that held nothing but a toggle and a bell. Together they
            ate close to a fifth of a laptop viewport before the page began.
            Everything now sits on a single 56px rule.

            The account menu lives here too. It used to sit in the sidebar
            footer, where the aside's `overflow-hidden` clipped a popover
            positioned outside it, so opening the menu appeared to swallow
            the navigation. Moving it removes the conflict rather than
            patching the clipping. */}
        <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="sm:hidden">
              <Wordmark />
            </span>
            {workspaceName && (
              <span className="truncate text-sm font-medium text-foreground max-sm:max-w-[7rem] max-sm:border-l max-sm:border-border max-sm:pl-2.5 max-sm:text-[11px] max-sm:text-muted">
                {workspaceName}
              </span>
            )}
          </div>

          {/* The palette trigger sits with the workspace identity rather than
              in the ml-auto cluster, so search reads as part of the workspace
              instead of as another status control. The dialog is rendered by
              the same component, so Cmd-K works on every page in this group
              without each one mounting anything. */}
          <div className="ml-3 min-w-0">
            <CommandPalette
              actionContext={{
                isAdmin: role === "ADMIN" && capabilities.adminConsole,
                hasTeams: capabilities.teams,
              }}
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Sending mode stays on screen at all times: no one should ever
                have to guess whether a send reaches real people. It is a pill
                rather than a coloured band, and it keeps the full sentence in
                its title and screen-reader label. */}
            {sending.testMode ? (
              <span
                className="badge alert-warning shrink-0 border text-warning"
                title="Test mode: emails only go to your test address, never real recipients."
              >
                <Icon name="shield" size={13} aria-hidden />
                <span aria-hidden className="hidden sm:inline">
                  Test mode
                </span>
                <span className="sr-only">
                  Test mode: emails only go to your test address, never real recipients.
                </span>
              </span>
            ) : (
              <span
                className="badge alert-success shrink-0 border text-success"
                title="Live: campaigns send real emails to real recipients."
              >
                <span aria-hidden>●</span>
                <span aria-hidden className="hidden sm:inline">
                  Live
                </span>
                <span className="sr-only">
                  Live: campaigns send real emails to real recipients.
                </span>
              </span>
            )}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <NotificationBell />
            {/* Below sm the account actions live in the mobile More sheet,
                which already carries them along with the theme control. */}
            <span className="hidden sm:block">
              <AccountMenu
                displayName={displayName}
                email={email}
                role={role}
                roleLabel={roleLabel}
                placement="bar"
              />
            </span>
          </div>
        </header>

        {/* Platform notices, above the page rather than inside it: during an
            incident the useful thing is that every page says the same sentence,
            not that one page mentions it. */}
        {platform.sendingHalted || platform.readOnlyMode || platform.noticeBanner !== "" ? (
          <div
            className={`border-b px-4 py-3 text-sm sm:px-6 md:px-10 ${
              platform.sendingHalted || platform.noticeSeverity === "WARNING"
                ? "alert-warning"
                : "border-border bg-surface-2 text-muted"
            }`}
            role="status"
          >
            {platform.sendingHalted ? (
              <p>
                <strong>Sending is paused across Cadence.</strong>{" "}
                {platform.haltReason.trim() !== ""
                  ? platform.haltReason.trim()
                  : "We are dealing with a delivery issue."}{" "}
                Nothing is lost: campaigns resume where they stopped.
              </p>
            ) : platform.readOnlyMode ? (
              <p>
                <strong>Cadence is temporarily read-only.</strong> You can read everything;
                launching and importing will work again shortly.
              </p>
            ) : null}
            {platform.noticeBanner !== "" ? (
              <p className={platform.sendingHalted || platform.readOnlyMode ? "mt-1" : ""}>
                {platform.noticeBanner}
              </p>
            ) : null}
          </div>
        ) : null}

        <main id="dashboard-main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-28 outline-none sm:p-6 sm:pb-6 md:p-10">
          <div className="animate-rise">{children}</div>
        </main>
      </div>
      <ProductTour autoStart={onboardingComplete} />
    </div>
    </UIProviders>
  );
}

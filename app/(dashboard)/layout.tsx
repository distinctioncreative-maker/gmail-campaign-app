import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { resolveSendingState } from "@/lib/sending/mode";
import { NotificationBell } from "@/components/NotificationBell";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { ProductTour } from "@/components/tour/ProductTour";

const BASE_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/campaigns", label: "Campaigns", icon: "rocket" },
  { href: "/leads", label: "Leads", icon: "users" },
  { href: "/templates", label: "Templates", icon: "mail" },
  { href: "/sequences", label: "Follow-Ups", icon: "repeat" },
  { href: "/suppressions", label: "Do Not Email", icon: "ban" },
  { href: "/reports", label: "Reports", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/help", label: "Help", icon: "help" },
];

const MANAGER_NAV: NavItem[] = [{ href: "/team", label: "Team", icon: "team" }];
const ADMIN_NAV: NavItem[] = [
  { href: "/team", label: "Team", icon: "team" },
  { href: "/admin", label: "Administration", icon: "admin" },
  { href: "/system-health", label: "System Health", icon: "health" },
];

function navForRole(role: string): NavItem[] {
  if (role === "ADMIN") return [...BASE_NAV, ...ADMIN_NAV];
  if (role === "MANAGER") return [...BASE_NAV, ...MANAGER_NAV];
  return BASE_NAV;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let displayName: string;
  let role: string;
  let organizationId: string;
  try {
    const ctx = await requireUser();
    displayName = ctx.user.displayName;
    role = ctx.role;
    organizationId = ctx.organizationId;
  } catch {
    redirect("/sign-in");
  }

  const nav = navForRole(role);
  const sending = await resolveSendingState(organizationId);

  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} displayName={displayName} role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Always-visible sending-mode banner so no one is ever unsure. */}
        {sending.testMode ? (
          <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-50 to-amber-100/60 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
            <span aria-hidden>🛡️</span>
            Test mode — emails only go to your test address, never real recipients.
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
            <span aria-hidden>●</span>
            Live — campaigns send real emails to real recipients.
          </div>
        )}
        <div className="glass sticky top-0 z-10 hidden items-center justify-end border-b border-border px-6 py-2.5 sm:flex">
          <NotificationBell />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6 md:p-8">
          <div className="animate-rise">{children}</div>
        </main>
      </div>
      <ProductTour />
    </div>
  );
}

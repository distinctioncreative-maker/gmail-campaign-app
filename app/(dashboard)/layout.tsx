import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { NotificationBell } from "@/components/NotificationBell";
import { Sidebar, type NavItem } from "@/components/Sidebar";

const BASE_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/campaigns", label: "Campaigns", icon: "🚀" },
  { href: "/leads", label: "Leads", icon: "👥" },
  { href: "/templates", label: "Templates", icon: "✉️" },
  { href: "/sequences", label: "Follow-Ups", icon: "🔁" },
  { href: "/suppressions", label: "Do Not Email", icon: "🚫" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/help", label: "Help", icon: "💬" },
];

const MANAGER_NAV: NavItem[] = [{ href: "/team", label: "Team", icon: "📈" }];
const ADMIN_NAV: NavItem[] = [
  { href: "/team", label: "Team", icon: "📈" },
  { href: "/admin", label: "Administration", icon: "🛠️" },
  { href: "/system-health", label: "System Health", icon: "❤️" },
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
  try {
    const ctx = await requireUser();
    displayName = ctx.user.displayName;
    role = ctx.role;
  } catch {
    redirect("/sign-in");
  }

  const nav = navForRole(role);

  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} displayName={displayName} role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-end border-b border-border bg-white/60 px-6 py-2.5 backdrop-blur sm:flex">
          <NotificationBell />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

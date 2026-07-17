import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { SignOutButton } from "@/components/SignOutButton";

const NAV = [
  { href: "/home", label: "Home" },
  { href: "/leads", label: "Leads" },
  { href: "/settings", label: "Settings" },
] as const;

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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 sm:flex">
        <div className="mb-8 px-2 text-lg font-semibold text-primary">Outreach</div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4">
          <p className="truncate px-2 text-sm font-medium text-slate-800">{displayName}</p>
          <p className="px-2 text-xs text-slate-500">{role.replace("_", " ").toLowerCase()}</p>
          <SignOutButton />
        </div>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
          <span className="font-semibold text-primary">Outreach</span>
          <nav className="flex gap-3" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-slate-700">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </div>
  );
}

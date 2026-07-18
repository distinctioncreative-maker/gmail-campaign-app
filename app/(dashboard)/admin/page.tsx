import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default async function AdminPage() {
  const ctx = await requireUser();
  if (ctx.role !== "ADMIN") redirect("/home");

  const [members, settings] = await Promise.all([
    listMembers(ctx.organizationId),
    getOrgSettings(ctx.organizationId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="mt-1 text-sm text-slate-600">Manage your team and organization policies.</p>
      <div className="mt-6">
        <AdminPanel
          currentUserId={ctx.userId}
          members={members.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
            active: m.active,
          }))}
          settings={settings}
        />
      </div>
    </div>
  );
}

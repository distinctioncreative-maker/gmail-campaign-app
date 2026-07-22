import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrgSettings, getOrganization, listMembers } from "@/lib/repositories/orgSettings";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { SendingModeCard } from "@/components/admin/SendingModeCard";
import { WorkspaceNameCard } from "@/components/admin/WorkspaceNameCard";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function AdminPage() {
  const ctx = await requireUser();
  if (ctx.role !== "ADMIN") redirect("/home");

  const [members, settings, org] = await Promise.all([
    listMembers(ctx.organizationId),
    getOrgSettings(ctx.organizationId),
    getOrganization(ctx.organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title="Administration"
        description="Roles, access, sending mode, and organization policies. Teams are managed on the Team page."
      />
      <div className="mt-6">
        <WorkspaceNameCard initial={org?.name ?? ""} />
      </div>
      <div className="mt-6">
        <SendingModeCard />
      </div>
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

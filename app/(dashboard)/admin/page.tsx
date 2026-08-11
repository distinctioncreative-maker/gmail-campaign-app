import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { getOrgSettings, getOrganization, listMembers } from "@/lib/repositories/orgSettings";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { SendingModeCard } from "@/components/admin/SendingModeCard";
import { AiWritingCard } from "@/components/admin/AiWritingCard";
import { InviteTeamCard } from "@/components/admin/InviteTeamCard";
import { BillingCard } from "@/components/admin/BillingCard";
import { WorkspaceNameCard } from "@/components/admin/WorkspaceNameCard";
import { CustomRolesCard } from "@/components/admin/CustomRolesCard";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";

export default async function AdminPage() {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    ctx.role !== "ADMIN" ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
  ) {
    redirect("/home");
  }

  const [members, org] = await Promise.all([
    listMembers(ctx.organizationId),
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
        <AiWritingCard />
      </div>
      <div className="mt-6">
        <BillingCard />
      </div>
      <div className="mt-6">
        <InviteTeamCard />
      </div>
      <div className="mt-6">
        <CustomRolesCard roles={settings.customRoles} />
      </div>
      <div className="mt-6">
        <Link
          href="/admin/audit"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2 className="font-medium">Activity log</h2>
            <p className="mt-1 text-sm text-muted">
              Who changed the sending mode, roles, mailboxes, keys, and webhooks, and who exported
              or deleted data.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div className="mt-6">
        <Link
          href="/admin/waitlist"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2 className="font-medium">Early-access waitlist</h2>
            <p className="mt-1 text-sm text-muted">
              View and export everyone who signed up from the public landing page.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div className="mt-6">
        <Link
          href="/admin/features"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2 className="font-medium">Feature checklist</h2>
            <p className="mt-1 text-sm text-muted">
              What&apos;s shipped, in beta, or on the roadmap, kept accurate automatically.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div className="mt-6">
        <AdminPanel
          currentUserId={ctx.userId}
          members={members.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
            customRoleId: m.customRoleId,
            roleLabel: m.roleLabel,
            active: m.active,
          }))}
          settings={settings}
          customRoles={settings.customRoles}
        />
      </div>
    </div>
  );
}

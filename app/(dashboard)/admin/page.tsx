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
    <div className="page-sections">
      <PageHeader
        title="Administration"
        description="Roles, access, sending mode, and organization policies. Teams are managed on the Team page."
      />
      <div>
        <WorkspaceNameCard initial={org?.name ?? ""} />
      </div>
      <div>
        <SendingModeCard />
      </div>
      <div>
        <AiWritingCard />
      </div>
      <div>
        <BillingCard />
      </div>
      <div>
        <InviteTeamCard />
      </div>
      <div>
        <CustomRolesCard roles={settings.customRoles} />
      </div>
      <div>
        <Link
          href="/admin/audit"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2>Activity log</h2>
            <p className="mt-1 text-muted">
              Who changed the sending mode, roles, mailboxes, keys, and webhooks, and who exported
              or deleted data.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div>
        <Link
          href="/admin/waitlist"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2>Early-access waitlist</h2>
            <p className="mt-1 text-muted">
              View and export everyone who signed up from the public landing page.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div>
        <Link
          href="/admin/features"
          className="card p-6 sm:p-7 card-hover flex items-center justify-between no-underline"
        >
          <div>
            <h2>Feature checklist</h2>
            <p className="mt-1 text-muted">
              What&apos;s shipped, in beta, or on the roadmap, kept accurate automatically.
            </p>
          </div>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </div>
      <div>
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

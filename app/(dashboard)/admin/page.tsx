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
import { Section } from "@/components/ui/Section";
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
      {/* Four named groups, where there were ten cards each wrapped in a bare
          div. The three sub-page links were the same twelve lines of markup
          three times over, each with its own <h2>; they are one local
          component now, and their headings are h3s that sit under a group
          title rather than competing with it. */}
      <Section title="Workspace">
        <WorkspaceNameCard initial={org?.name ?? ""} />
        <BillingCard />
        <InviteTeamCard />
      </Section>

      <Section
        title="Sending"
        description="What this workspace is allowed to send, and with what help."
      >
        <SendingModeCard />
        <AiWritingCard />
      </Section>

      <Section title="People and roles">
        <CustomRolesCard roles={settings.customRoles} />
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
      </Section>

      <Section title="Records">
        <AdminLink
          href="/admin/audit"
          title="Activity log"
          description="Who changed the sending mode, roles, mailboxes, keys, and webhooks, and who exported or deleted data."
        />
        <AdminLink
          href="/admin/waitlist"
          title="Early-access waitlist"
          description="View and export everyone who signed up from the public landing page."
        />
        <AdminLink
          href="/admin/features"
          title="Feature checklist"
          description="What's shipped, in beta, or on the roadmap, kept accurate automatically."
        />
      </Section>
    </div>
  );
}

/**
 * A card that is only a link to a sub-page. Three of these were written out
 * longhand, which is how one of them ends up with different padding from the
 * other two a month later.
 */
function AdminLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card card-hover flex items-center justify-between gap-4 p-6 no-underline sm:p-7"
    >
      <div className="min-w-0">
        <h3>{title}</h3>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      <span aria-hidden className="shrink-0 text-muted">
        →
      </span>
    </Link>
  );
}

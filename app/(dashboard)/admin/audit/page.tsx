import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditLogList } from "@/components/admin/AuditLogList";

/** Admin-only view of who changed what about the workspace. */
export default async function AuditPage() {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    ctx.role !== "ADMIN" ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
  ) {
    redirect("/home");
  }

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Every administrative change to this workspace, in the order it happened."
      />

      <p className="mt-4 text-sm text-muted">
        <Link
          href="/admin"
          className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          ← Back to Administration
        </Link>
      </p>

      <p className="mt-4 max-w-2xl text-sm text-muted">
        Entries are added, never edited or removed, and nothing here can be changed from the app.
        Deleting the workspace deletes this log with it, because a record of a workspace we promised
        to destroy is still a record.
      </p>

      <AuditLogList />
    </div>
  );
}

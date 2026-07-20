import { requireUser } from "@/lib/auth/requireUser";
import {
  listOrgSuppressions,
  listSuppressions,
} from "@/lib/repositories/suppressions";
import { SuppressionsManager } from "@/components/SuppressionsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function SuppressionsPage() {
  const ctx = await requireUser();
  const [mine, org] = await Promise.all([
    listSuppressions(ctx, 500),
    listOrgSuppressions(ctx, 500),
  ]);

  const rows = [...mine, ...org].map((s) => ({
    suppressionId: s.suppressionId,
    email: s.email,
    reason: s.reason,
    scope: s.scope,
    source: s.source,
    active: s.active,
    createdAt: s.createdAt,
    details: s.details,
  }));

  return (
    <div>
      <PageHeader
        title="Do-not-email list"
        description="People on this list are automatically excluded from every campaign — imports, sends, and follow-ups all check it. Entries are never removed automatically."
      />
      <SuppressionsManager rows={rows} isAdmin={ctx.role === "ADMIN"} />
    </div>
  );
}

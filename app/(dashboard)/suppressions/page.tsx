import { requireUser } from "@/lib/auth/requireUser";
import {
  listOrgSuppressions,
  listSuppressions,
} from "@/lib/repositories/suppressions";
import { SuppressionsManager } from "@/components/SuppressionsManager";

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
      <h1 className="text-2xl font-semibold">Do-not-email list</h1>
      <p className="mt-1 text-sm text-slate-600">
        People on this list are automatically excluded from every campaign — imports,
        sends, and follow-ups all check it. Entries are never removed automatically.
      </p>
      <div className="mt-6">
        <SuppressionsManager rows={rows} isAdmin={ctx.role === "ADMIN"} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { PageHeader } from "@/components/ui/PageHeader";
import { FEATURE_CATEGORIES, countByStatus, type FeatureStatus } from "@/lib/features/registry";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

const STATUS_BADGE: Record<FeatureStatus, { label: string; className: string }> = {
  shipped: { label: "Shipped", className: "bg-green-50 text-green-700" },
  beta: { label: "Beta", className: "bg-amber-50 text-amber-700" },
  planned: { label: "Planned", className: "bg-surface-2 text-muted" },
};

/** Admin-only, live view of lib/features/registry.ts — the same source that
 * generates FEATURES.md. Editing the registry and redeploying is the only
 * way to change what shows up here, so this view can never drift from the
 * doc the way a hand-maintained checklist would. */
export default async function FeaturesPage() {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    ctx.role !== "ADMIN" ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
  ) {
    redirect("/home");
  }

  const counts = countByStatus();

  return (
    <div>
      <PageHeader
        title="Feature checklist"
        description="What Cadence can do today, and what's still on the roadmap. Generated from the same registry as FEATURES.md in the repo."
      />

      <p className="mt-4 text-sm text-muted">
        <Link href="/admin" className="text-primary hover:underline">
          ← Back to Administration
        </Link>
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums text-foreground">{counts.shipped}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Shipped</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums text-foreground">{counts.beta}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Beta</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums text-foreground">{counts.planned}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Planned</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {FEATURE_CATEGORIES.map((category) => (
          <div key={category.id} className="card p-5">
            <h2 className="font-medium text-foreground">{category.name}</h2>
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {category.features.map((f) => {
                const badge = STATUS_BADGE[f.status];
                return (
                  <li key={f.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted">{f.description}</p>
                    {f.keyFiles?.length ? (
                      <p className="font-mono text-xs text-muted/70">{f.keyFiles.join(" · ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

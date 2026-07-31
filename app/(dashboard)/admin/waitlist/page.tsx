import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { listWaitlist } from "@/lib/repositories/waitlist";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

/** Admin-only view of private-pilot requests, with CSV export. */
export default async function WaitlistPage() {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    ctx.role !== "ADMIN" ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
  ) {
    redirect("/home");
  }

  const entries = await listWaitlist();
  const rows = entries.map((e) => [
    e.email,
    e.source,
    e.createdAt ? new Date(e.createdAt).toISOString() : "",
  ]);

  return (
    <div>
      <PageHeader
        title="Pilot requests"
        description="Everyone who requested a private Cadence pilot from the public landing page."
        actions={
          entries.length > 0 ? (
            <ExportCsvButton
              filename="cadence-pilot-requests.csv"
              headers={["Email", "Source", "Joined (UTC)"]}
              rows={rows}
            />
          ) : null
        }
      />

      <p className="mt-4 text-sm text-muted">
        <Link href="/admin" className="text-primary hover:underline">
          ← Back to Administration
        </Link>
      </p>

      <div className="mt-4 max-w-xs">
        <StatTile
          label="Total requests"
          value={entries.length.toLocaleString()}
          icon="users"
          hint="Submitted from the public landing page"
        />
      </div>

      {entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            variant="inline"
            icon="users"
            title="No pilot requests yet"
            description="Requests appear here as soon as someone submits the form on the public landing page."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.email} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{e.email}</td>
                  <td className="px-4 py-3 text-muted">{e.source || "Not available"}</td>
                  <td className="px-4 py-3 text-muted">
                    {e.createdAt ? <LocalTime value={e.createdAt} /> : "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

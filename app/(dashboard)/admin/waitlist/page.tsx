import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { listWaitlist } from "@/lib/repositories/waitlist";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, TableRow } from "@/components/ui/DataTable";
import { LocalTime } from "@/components/LocalTime";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

/** Admin-only view of Talk to sales enquiries, with CSV export. */
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
    <div className="page-sections">
      <PageHeader
        title="Sales enquiries"
        description="Everyone who asked to talk to sales from the public landing page."
        actions={
          entries.length > 0 ? (
            <ExportCsvButton
              filename="cadence-sales-enquiries.csv"
              headers={["Email", "Source", "Joined (UTC)"]}
              rows={rows}
            />
          ) : null
        }
      />

      <p className="text-sm text-muted">
        <Link href="/admin" className="text-foreground link">
          ← Back to Administration
        </Link>
      </p>

      <div className="max-w-xs">
        <StatTile
          label="Total requests"
          value={entries.length.toLocaleString()}
          icon="users"
          hint="Submitted from the public landing page"
        />
      </div>

      {entries.length === 0 ? (
        <div>
          <EmptyState
            variant="inline"
            icon="users"
            title="No enquiries yet"
            description="Requests appear here as soon as someone submits the form on the public landing page."
          />
        </div>
      ) : (
        <DataTable className="card"
        head={<>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Joined</th>
              </>}
      >
              {entries.map((e) => (
                <TableRow key={e.email}>
                  <td className="px-4 py-3 font-medium">{e.email}</td>
                  <td className="px-4 py-3 text-muted">{e.source || "Not available"}</td>
                  <td className="px-4 py-3 text-muted">
                    {e.createdAt ? <LocalTime value={e.createdAt} /> : "Not available"}
                  </td>
                </TableRow>
              ))}
            </DataTable>
      )}
    </div>
  );
}

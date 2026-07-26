import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { listWaitlist } from "@/lib/repositories/waitlist";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { ExportCsvButton } from "@/components/analytics/ExportCsvButton";

/** Admin-only view of early-access waitlist signups, with CSV export. */
export default async function WaitlistPage() {
  const ctx = await requireUser();
  if (ctx.role !== "ADMIN") redirect("/home");

  const entries = await listWaitlist();
  const rows = entries.map((e) => [
    e.email,
    e.source,
    e.createdAt ? new Date(e.createdAt).toISOString() : "",
  ]);

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description="Everyone who requested early access from the public landing page."
        actions={
          entries.length > 0 ? (
            <ExportCsvButton
              filename="cadence-waitlist.csv"
              headers={["Email", "Source", "Joined (UTC)"]}
              rows={rows}
            />
          ) : null
        }
      />

      <p className="mt-4 text-sm text-slate-500">
        <Link href="/admin" className="text-primary hover:underline">
          ← Back to Administration
        </Link>
      </p>

      <div className="mt-4">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Total signups</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{entries.length}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="mt-6 card p-8 text-center text-sm text-slate-500">
          No signups yet. They&apos;ll appear here as people join from the landing page.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.email} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{e.email}</td>
                  <td className="px-4 py-3 text-slate-500">{e.source || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.createdAt ? <LocalTime value={e.createdAt} /> : "—"}
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

import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { CountUp } from "@/components/ui/CountUp";
import { DEMO_LEADS } from "@/lib/demo/fixtures";

const STATUS: Record<string, string> = {
  Ready: "bg-success-soft text-success",
  Contacted: "bg-info-soft text-info",
  Replied: "bg-revenue-soft text-revenue",
  Excluded: "bg-warning-soft text-warning",
};

export default function DemoLeadsPage() {
  const count = (s: string) => DEMO_LEADS.filter((l) => l.status === s).length;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Build reusable audiences, understand engagement, and keep every list clean."
      />

      <StatGrid columns={4}>
        <StatTile label="Ready" value={<CountUp value={count("Ready")} />} icon="check" tone="success" size="sm" hint="Never contacted and safe" />
        <StatTile label="Contacted" value={<CountUp value={count("Contacted")} />} icon="mail" tone="primary" size="sm" hint="Used in a campaign" />
        <StatTile label="Replied" value={<CountUp value={count("Replied")} />} icon="reply" tone="revenue" size="sm" hint="Live conversations" />
        <StatTile label="Excluded" value={<CountUp value={count("Excluded")} />} icon="ban" tone="warning" size="sm" hint="Suppressed or opted out" />
      </StatGrid>

      <div className="card mt-8 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Campaigns</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Replies</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_LEADS.map((l) => (
              <tr key={l.email} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3 text-muted">{l.business}</td>
                <td className="px-4 py-3 text-muted">{l.email}</td>
                <td className="px-4 py-3 tabular-nums">{l.campaigns}</td>
                <td className="px-4 py-3 tabular-nums">{l.sent}</td>
                <td className="px-4 py-3 tabular-nums">{l.replies}</td>
                <td className="px-4 py-3"><span className={`badge ${STATUS[l.status]}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

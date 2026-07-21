import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { firestore } from "@/lib/firebase/admin";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { getUser } from "@/lib/repositories/users";
import { resolveSendingState } from "@/lib/sending/mode";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";

/** A sweep is healthy if it ran within the last 6 hours. */
function sweepFresh(at: number | null): boolean {
  return at !== null && Date.now() - at < 6 * 60 * 60 * 1000;
}

const CONNECTION_LABELS: Record<string, { label: string; ok: boolean }> = {
  CONNECTED: { label: "Connected", ok: true },
  NEEDS_RECONNECT: { label: "Needs reconnect", ok: false },
  DISCONNECTED: { label: "Not connected", ok: false },
};

export default async function SystemHealthPage() {
  const ctx = await requireUser();
  if (ctx.role !== "ADMIN") redirect("/home");
  const organizationId = ctx.organizationId;

  const [sweepsSnap, members, sending] = await Promise.all([
    firestore().collection("system").doc("sweeps").get(),
    listMembers(organizationId),
    resolveSendingState(organizationId),
  ]);

  // Per-member diagnostics, all in parallel — one row per person.
  const memberRows = await Promise.all(
    members.map(async (m) => {
      const owner = { userId: m.userId, organizationId };
      const [conn, user, campaigns] = await Promise.all([
        getConnection(m.userId),
        getUser(m.userId),
        listCampaigns(owner, 100),
      ]);
      return {
        member: m,
        connectionStatus: conn?.status ?? "DISCONNECTED",
        connectedEmail: conn?.status === "CONNECTED" ? (conn.connectedEmail ?? "") : "",
        lastLoginAt: user?.lastLoginAt ?? null,
        activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
        erroredCampaigns: campaigns.filter((c) => c.status === "ERROR").length,
      };
    })
  );

  const connected = memberRows.filter((r) => r.connectionStatus === "CONNECTED").length;
  const needsReconnect = memberRows.filter((r) => r.connectionStatus === "NEEDS_RECONNECT").length;
  const activeCampaigns = memberRows.reduce((a, r) => a + r.activeCampaigns, 0);
  const erroredCampaigns = memberRows.reduce((a, r) => a + r.erroredCampaigns, 0);
  const sweepData = sweepsSnap.data() ?? {};
  const sweeps: Array<[string, number | null]> = [
    ["Reply sweep", (sweepData.replyLastRun as number) ?? null],
    ["Bounce sweep", (sweepData.bounceLastRun as number) ?? null],
    ["Repair sweep", (sweepData.repairLastRun as number) ?? null],
  ];

  const checks: Array<[string, string, boolean]> = [
    [
      "Sending mode",
      sending.testMode ? "TEST — all mail goes to the test address" : "LIVE — real recipients",
      true,
    ],
    [
      "Background sending (Cloud Tasks)",
      env.CLOUD_TASKS_SERVICE_ACCOUNT && env.APP_BASE_URL.startsWith("https://")
        ? "Configured"
        : "Not configured",
      Boolean(env.CLOUD_TASKS_SERVICE_ACCOUNT && env.APP_BASE_URL.startsWith("https://")),
    ],
    ["Token encryption (KMS)", env.TOKEN_KMS_KEY_RESOURCE ? "Configured" : "Local-dev only", Boolean(env.TOKEN_KMS_KEY_RESOURCE)],
    ["Gmail connections healthy", `${connected} of ${members.length}`, needsReconnect === 0],
    ["Active campaigns (org-wide)", String(activeCampaigns), true],
    ["Campaigns needing attention", String(erroredCampaigns), erroredCampaigns === 0],
  ];

  return (
    <div>
      <PageHeader
        title="System health"
        description="Troubleshooting console — platform checks, background sweeps, and each person's connection at a glance."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Platform checks</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {checks.map(([label, value, ok]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-slate-600">{value}</td>
                  <td className="px-4 py-3 text-right">
                    <span aria-hidden>{ok ? "✅" : "⚠️"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Background sweeps</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {sweeps.map(([label, at]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {at ? (
                      <>
                        Last ran <LocalTime value={at} />
                      </>
                    ) : (
                      "Never"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span aria-hidden>{sweepFresh(at) ? "✅" : "⚠️"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-400">
            Sweeps run on a schedule. A warning here usually means Cloud Scheduler isn&apos;t set up
            or hasn&apos;t fired yet — see scripts/setup-cloud.sh.
          </p>
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-medium">People</h2>
      <div className="overflow-x-auto card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Gmail</th>
              <th className="px-4 py-3">Active campaigns</th>
              <th className="px-4 py-3">Problems</th>
              <th className="px-4 py-3">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {memberRows.map(({ member: m, ...r }) => {
              const conn = CONNECTION_LABELS[r.connectionStatus] ?? { label: r.connectionStatus, ok: false };
              return (
                <tr key={m.userId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.email}</span>
                    {!m.active && <span className="ml-2 badge bg-slate-200 text-slate-600">disabled</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        conn.ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {conn.label}
                    </span>
                    {r.connectedEmail && r.connectedEmail !== m.email && (
                      <span className="ml-2 text-xs text-amber-600">sends as {r.connectedEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.activeCampaigns}</td>
                  <td className="px-4 py-3">
                    {r.erroredCampaigns > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        {r.erroredCampaigns} campaign{r.erroredCampaigns === 1 ? "" : "s"} errored
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.lastLoginAt ? <LocalTime value={r.lastLoginAt} /> : "Never"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        “Needs reconnect” means that person must open Settings and reconnect Gmail before their
        campaigns can send or scan replies.
      </p>
    </div>
  );
}

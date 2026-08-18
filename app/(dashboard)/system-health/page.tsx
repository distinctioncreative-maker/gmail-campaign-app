import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { firestore } from "@/lib/firebase/admin";
import { getOrgSettings, listMembers } from "@/lib/repositories/orgSettings";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { getUser } from "@/lib/repositories/users";
import { resolveSendingState } from "@/lib/sending/mode";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LocalTime } from "@/components/LocalTime";
import { Icon } from "@/components/ui/Icon";
import { campaignsIncludedInWorkspaceStats } from "@/lib/campaigns/lifecycle";

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
  const settings = await getOrgSettings(ctx.organizationId);
  if (
    ctx.role !== "ADMIN" ||
    !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
  ) {
    redirect("/home");
  }
  const organizationId = ctx.organizationId;

  const [sweepsSnap, members, sending] = await Promise.all([
    firestore().collection("system").doc("sweeps").get(),
    listMembers(organizationId),
    resolveSendingState(organizationId),
  ]);

  // Per-member diagnostics, all in parallel: one row per person.
  const memberRows = await Promise.all(
    members.map(async (m) => {
      const owner = { userId: m.userId, organizationId };
      const [conn, user, campaigns] = await Promise.all([
        getConnection(m.userId),
        getUser(m.userId),
        listCampaigns(owner, 100),
      ]);
      const visibleCampaigns = campaignsIncludedInWorkspaceStats(campaigns);
      return {
        member: m,
        displayName: user?.displayName ?? "",
        connectionStatus: conn?.status ?? "DISCONNECTED",
        connectedEmail: conn?.status === "CONNECTED" ? (conn.connectedEmail ?? "") : "",
        lastLoginAt: user?.lastLoginAt ?? null,
        activeCampaigns: visibleCampaigns.filter((c) => c.status === "ACTIVE").length,
        erroredCampaigns: visibleCampaigns.filter((c) => c.status === "ERROR").length,
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
      sending.testMode ? "TEST: all mail goes to the test address" : "LIVE: real recipients",
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
        description="Troubleshooting console: platform checks, background sweeps, and each person's connection at a glance."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Platform checks</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {checks.map(([label, value, ok]) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-muted">{value}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`} title={ok ? "Healthy" : "Needs attention"}>
                      <Icon name={ok ? "check" : "alert"} size={14} aria-hidden />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Background sweeps</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {sweeps.map(([label, at]) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-muted">
                    {at ? (
                      <>
                        Last ran <LocalTime value={at} />
                      </>
                    ) : (
                      "Never"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${sweepFresh(at) ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`} title={sweepFresh(at) ? "Healthy" : "Needs attention"}>
                      <Icon name={sweepFresh(at) ? "check" : "alert"} size={14} aria-hidden />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted">
            Sweeps run on a schedule. A warning here usually means Cloud Scheduler isn&apos;t set up
            or hasn&apos;t fired yet: see scripts/setup-cloud.sh.
          </p>
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-medium">People</h2>
      <DataTable className="card"
        head={<>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Gmail</th>
              <th className="px-4 py-3">Active campaigns</th>
              <th className="px-4 py-3">Problems</th>
              <th className="px-4 py-3">Last sign-in</th>
            </>}
      >
            {memberRows.map(({ member: m, ...r }) => {
              const conn = CONNECTION_LABELS[r.connectionStatus] ?? { label: r.connectionStatus, ok: false };
              return (
                <tr key={m.userId} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.displayName || m.email}</span>
                    {!m.active && <span className="ml-2 badge bg-border text-muted">disabled</span>}
                    {r.displayName && <p className="text-xs text-muted">{m.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        conn.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                      }`}
                    >
                      {conn.label}
                    </span>
                    {r.connectedEmail && r.connectedEmail !== m.email && (
                      <span className="ml-2 text-xs text-warning">sends as {r.connectedEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.activeCampaigns}</td>
                  <td className="px-4 py-3">
                    {r.erroredCampaigns > 0 ? (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">
                        {r.erroredCampaigns} campaign{r.erroredCampaigns === 1 ? "" : "s"} errored
                      </span>
                    ) : (
                      <span className="text-xs text-muted">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {r.lastLoginAt ? <LocalTime value={r.lastLoginAt} /> : "Never"}
                  </td>
                </tr>
              );
            })}
          </DataTable>
      <p className="mt-3 text-xs text-muted">
        “Needs reconnect” means that person must open Settings and reconnect Gmail before their
        campaigns can send or scan replies.
      </p>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { firestore } from "@/lib/firebase/admin";
import { listMembers } from "@/lib/repositories/orgSettings";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { env, isTestMode } from "@/lib/env";

async function loadHealth(organizationId: string, ownerUserId: string) {
  const owner = { userId: ownerUserId, organizationId };
  const [sweeps, members] = await Promise.all([
    firestore().collection("system").doc("sweeps").get(),
    listMembers(organizationId),
  ]);

  let connected = 0;
  let needsReconnect = 0;
  for (const m of members) {
    const conn = await getConnection(m.userId);
    if (conn?.status === "CONNECTED") connected++;
    else if (conn?.status === "NEEDS_RECONNECT") needsReconnect++;
  }

  const campaigns = await listCampaigns(owner, 200);
  const sweepData = sweeps.data() ?? {};

  return {
    testMode: isTestMode(),
    tasksConfigured: Boolean(env.CLOUD_TASKS_SERVICE_ACCOUNT && env.APP_BASE_URL.startsWith("https://")),
    kmsConfigured: Boolean(env.TOKEN_KMS_KEY_RESOURCE),
    members: members.length,
    connected,
    needsReconnect,
    activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
    erroredCampaigns: campaigns.filter((c) => c.status === "ERROR").length,
    replyLastRun: (sweepData.replyLastRun as number) ?? null,
    bounceLastRun: (sweepData.bounceLastRun as number) ?? null,
    repairLastRun: (sweepData.repairLastRun as number) ?? null,
  };
}

function ts(v: number | null): string {
  return v ? new Date(v).toLocaleString() : "Never";
}

export default async function SystemHealthPage() {
  const ctx = await requireUser();
  if (ctx.role !== "ADMIN") redirect("/home");
  const h = await loadHealth(ctx.organizationId, ctx.userId);

  const rows: Array<[string, string, boolean]> = [
    ["Test mode (safe sending)", h.testMode ? "ON — all mail goes to test address" : "OFF — sending real email", h.testMode],
    ["Background sending (Cloud Tasks)", h.tasksConfigured ? "Configured" : "Not configured", h.tasksConfigured],
    ["Token encryption (KMS)", h.kmsConfigured ? "Configured" : "Local-dev only", h.kmsConfigured],
    ["Gmail connections healthy", `${h.connected} of ${h.members}`, h.needsReconnect === 0],
    ["Active campaigns", String(h.activeCampaigns), true],
    ["Campaigns needing attention", String(h.erroredCampaigns), h.erroredCampaigns === 0],
    ["Reply sweep last run", ts(h.replyLastRun), true],
    ["Bounce sweep last run", ts(h.bounceLastRun), true],
    ["Repair sweep last run", ts(h.repairLastRun), true],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">System health</h1>
      <p className="mt-1 text-sm text-slate-600">Diagnostics for administrators.</p>
      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map(([label, value, ok]) => (
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
    </div>
  );
}

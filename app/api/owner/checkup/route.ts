import { NextResponse } from "next/server";
import { handleApiErrors } from "@/lib/api";
import { requireOperator } from "@/lib/auth/requireOperator";
import { platformCounts, workspaceRisks } from "@/lib/platform/checkup";
import { recordPlatformAudit } from "@/lib/platform/state";

/**
 * The checkup: a cross-tenant read, which is a capability nothing else in the
 * product has.
 *
 * That is exactly why looking at it is itself audited. An operator reading every
 * workspace's send volume is a legitimate and necessary act, and it is also the
 * kind of act that should leave a trace: if the question "who looked at customer
 * data and when" ever needs an answer, the absence of a record is the answer
 * nobody wants.
 *
 * Separate from the main owner route because it is the only expensive one here. A
 * fan-out across every organization does not belong on the same handler as
 * flipping a boolean.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireOperator();
  const [counts, risks] = await Promise.all([platformCounts(), workspaceRisks()]);

  await recordPlatformAudit({
    action: "checkup.viewed",
    operatorEmail: ctx.email,
    summary: `${ctx.email} viewed the platform checkup.`,
    details: { workspacesInspected: risks.length },
  });

  return NextResponse.json({
    counts,
    risks,
    needsAction: risks.filter((r) => r.verdict === "ACT").length,
    watching: risks.filter((r) => r.verdict === "WATCH").length,
  });
});

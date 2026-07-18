import { NextRequest, NextResponse } from "next/server";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import { firestore } from "@/lib/firebase/admin";
import { processBouncesForUser, processRepliesForUser } from "@/lib/campaigns/monitoring";
import { listAllOwners, repairOwner } from "@/lib/campaigns/repair";

/**
 * Cloud Scheduler entry point for periodic system sweeps (spec §16/§17/§25).
 * OIDC-verified. ?job=reply|bounce|repair|metrics.
 *
 * Sweeps enumerate users with active campaigns and process them; the
 * per-user monitoring functions themselves skip users without work.
 */
export async function POST(req: NextRequest) {
  try {
    await verifyTaskRequest(req);
  } catch (err) {
    const message = err instanceof TaskAuthError ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") ?? "reply";
  const owners = await listAllOwners();
  const summary: Record<string, number> = { owners: owners.length };

  for (const owner of owners) {
    try {
      if (job === "reply") {
        const r = await processRepliesForUser(owner);
        summary.replied = (summary.replied ?? 0) + r.replied;
      } else if (job === "bounce") {
        const r = await processBouncesForUser(owner);
        summary.bounces = (summary.bounces ?? 0) + r.bounces;
      } else if (job === "repair") {
        const r = await repairOwner(owner);
        summary.reset = (summary.reset ?? 0) + r.reset;
        summary.requeued = (summary.requeued ?? 0) + r.requeued;
      } else if (job === "metrics") {
        // Recalculate lightweight metrics timestamp marker.
        await firestore()
          .collection("system")
          .doc("metrics")
          .set({ lastRun: Date.now() }, { merge: true });
      }
    } catch (err) {
      console.error("[sweep] owner failed", { job, userId: owner.userId, err: String(err) });
    }
  }

  await firestore()
    .collection("system")
    .doc("sweeps")
    .set({ [`${job}LastRun`]: Date.now() }, { merge: true });

  return NextResponse.json({ ok: true, job, ...summary });
}

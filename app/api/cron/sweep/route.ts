import { NextRequest, NextResponse } from "next/server";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import { firestore } from "@/lib/firebase/admin";
import { processBouncesForUser, processRepliesForUser } from "@/lib/campaigns/monitoring";
import { listAllOwners, repairOwner } from "@/lib/campaigns/repair";
import { recomputeBenchmarks } from "@/lib/benchmarks/aggregate";
import { purgeDueRequests } from "@/lib/account/deletion";

/**
 * Cloud Scheduler entry point for periodic system sweeps (spec §16/§17/§25).
 * OIDC-verified. ?job=reply|bounce|repair|metrics|benchmarks|deletions.
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

  // Keyed by request rather than by owner, and it must not run through the
  // owner loop below: purging an owner mid-sweep would leave the other jobs
  // reading a subtree that is disappearing underneath them.
  if (job === "deletions") {
    const result = await purgeDueRequests();
    await firestore()
      .collection("system")
      .doc("sweeps")
      .set({ deletionsLastRun: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true, job, ...result });
  }

  // Cross-tenant aggregate, not a per-owner sweep: recomputes its own
  // owner list internally (see lib/benchmarks/aggregate.ts).
  if (job === "benchmarks") {
    const snapshot = await recomputeBenchmarks();
    await firestore()
      .collection("system")
      .doc("sweeps")
      .set({ benchmarksLastRun: Date.now() }, { merge: true });
    return NextResponse.json({
      ok: true,
      job,
      campaignsConsidered: snapshot.totalCampaignsConsidered,
    });
  }

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
        summary.ambiguous = (summary.ambiguous ?? 0) + r.ambiguous;
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

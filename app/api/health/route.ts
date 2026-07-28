import { NextResponse } from "next/server";
import { firestore } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Lightweight readiness probe for uptime monitors. Public and unauthenticated
 * (reveals no data): checks that the process is up and Firestore is
 * reachable. Returns 200 when healthy, 503 when a dependency is down.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "down" = "ok";
  try {
    // Cheap connectivity probe: a limit(1) read against a tiny collection.
    await firestore().collection("_health").limit(1).get();
  } catch {
    db = "down";
  }
  const healthy = db === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks: { firestore: db }, ms: Date.now() - started },
    { status: healthy ? 200 : 503 }
  );
}

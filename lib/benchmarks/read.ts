import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { BenchmarksSnapshot } from "./buckets";

/**
 * Read the last computed global benchmarks snapshot. Never computes it
 * live — that only ever happens in the scheduled sweep (job=benchmarks) —
 * so reading this is cheap regardless of how many users/campaigns exist.
 * Returns null before the sweep has ever run.
 */
export async function getBenchmarksSnapshot(): Promise<BenchmarksSnapshot | null> {
  const snap = await firestore().collection("benchmarks").doc("global").get();
  if (!snap.exists) return null;
  return snap.data() as BenchmarksSnapshot;
}

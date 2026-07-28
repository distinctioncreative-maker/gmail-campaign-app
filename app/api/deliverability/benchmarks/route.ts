import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getBenchmarksSnapshot } from "@/lib/benchmarks/read";

/**
 * Any signed-in user can read this: the data is anonymized and
 * bucket-gated by design (see lib/benchmarks/buckets.ts
 * MIN_SAMPLE_TO_SURFACE), so there's nothing tenant-specific to protect.
 * Still behind requireUser() rather than made public, consistent with the
 * rest of the app.
 */
export const GET = handleApiErrors(async () => {
  await requireUser();
  const snapshot = await getBenchmarksSnapshot();
  return NextResponse.json({ snapshot });
});

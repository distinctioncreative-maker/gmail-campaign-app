import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { AuthContext } from "@/lib/auth/requireUser";
import type { CsvMapping } from "@/lib/leads/csv";

function settingsRef(ctx: AuthContext, doc: string) {
  return firestore().collection("users").doc(ctx.userId).collection("userSettings").doc(doc);
}

export async function getSavedCsvMapping(ctx: AuthContext): Promise<CsvMapping | null> {
  const snap = await settingsRef(ctx, "importMappings").get();
  const data = snap.data();
  return snap.exists && data?.csvMapping ? (data.csvMapping as CsvMapping) : null;
}

export async function saveCsvMapping(ctx: AuthContext, mapping: CsvMapping): Promise<void> {
  await settingsRef(ctx, "importMappings").set(
    {
      ownerUserId: ctx.userId,
      organizationId: ctx.organizationId,
      csvMapping: mapping,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

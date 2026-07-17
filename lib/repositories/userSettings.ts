import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { Scope } from "@/lib/repositories/scope";
import type { CsvMapping } from "@/lib/leads/csv";
import { SenderProfileSchema, type SenderProfile } from "@/schemas/userSettings";

function settingsRef(ctx: Scope, doc: string) {
  return firestore().collection("users").doc(ctx.userId).collection("userSettings").doc(doc);
}

export async function getSavedCsvMapping(ctx: Scope): Promise<CsvMapping | null> {
  const snap = await settingsRef(ctx, "importMappings").get();
  const data = snap.data();
  return snap.exists && data?.csvMapping ? (data.csvMapping as CsvMapping) : null;
}

export async function getSenderProfile(ctx: Scope): Promise<SenderProfile> {
  const snap = await settingsRef(ctx, "profile").get();
  return SenderProfileSchema.parse(snap.exists ? snap.data() : {});
}

export async function saveSenderProfile(
  ctx: Scope,
  profile: Partial<SenderProfile>
): Promise<SenderProfile> {
  const current = await getSenderProfile(ctx);
  const merged = SenderProfileSchema.parse({
    ...current,
    ...profile,
    sendingDefaults: { ...current.sendingDefaults, ...(profile.sendingDefaults ?? {}) },
    updatedAt: Date.now(),
  });
  await settingsRef(ctx, "profile").set(
    { ...merged, ownerUserId: ctx.userId, organizationId: ctx.organizationId },
    { merge: false }
  );
  return merged;
}

export async function saveCsvMapping(ctx: Scope, mapping: CsvMapping): Promise<void> {
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

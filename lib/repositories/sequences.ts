import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { Scope } from "@/lib/repositories/scope";
import { SequenceSchema, type Sequence, type SequenceInput } from "@/schemas/sequence";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

function sequencesRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("sequences");
}

/** Normalize + sanitize each step's inline custom body at the storage
 * boundary, and stamp step IDs. */
function prepareSteps(steps: SequenceInput["steps"]): Sequence["steps"] {
  return steps.map((s) => ({
    ...s,
    stepId: s.stepId ?? crypto.randomUUID(),
    customHtml: s.bodyMode === "CUSTOM" ? sanitizeEmailHtml(s.customHtml ?? "") : (s.customHtml ?? ""),
  })) as Sequence["steps"];
}

export async function listSequences(ctx: Scope): Promise<Sequence[]> {
  const snap = await sequencesRef(ctx).orderBy("updatedAt", "desc").limit(100).get();
  return snap.docs.map((d) => SequenceSchema.parse(d.data())).filter((s) => s.active);
}

export async function getSequence(ctx: Scope, sequenceId: string): Promise<Sequence | null> {
  const snap = await sequencesRef(ctx).doc(sequenceId).get();
  return snap.exists ? SequenceSchema.parse(snap.data()) : null;
}

export async function createSequence(ctx: Scope, input: SequenceInput): Promise<Sequence> {
  const now = Date.now();
  const sequenceId = crypto.randomUUID();
  const sequence = SequenceSchema.parse({
    sequenceId,
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    name: input.name,
    description: input.description,
    active: true,
    stopOnReply: input.stopOnReply,
    stopOnBounce: input.stopOnBounce,
    stopOnUnsubscribe: input.stopOnUnsubscribe,
    stopOnSuppression: true,
    outOfOfficePolicy: input.outOfOfficePolicy,
    outOfOfficePauseDays: input.outOfOfficePauseDays,
    steps: prepareSteps(input.steps),
    createdAt: now,
    updatedAt: now,
  });
  await sequencesRef(ctx).doc(sequenceId).create(sequence);
  return sequence;
}

export async function updateSequence(
  ctx: Scope,
  sequenceId: string,
  input: SequenceInput
): Promise<Sequence | null> {
  const existing = await getSequence(ctx, sequenceId);
  if (!existing) return null;
  const updated = SequenceSchema.parse({
    ...existing,
    ...input,
    steps: prepareSteps(input.steps),
    updatedAt: Date.now(),
  });
  await sequencesRef(ctx).doc(sequenceId).set(updated);
  return updated;
}

export async function archiveSequence(ctx: Scope, sequenceId: string): Promise<void> {
  await sequencesRef(ctx).doc(sequenceId).update({ active: false, updatedAt: Date.now() });
}

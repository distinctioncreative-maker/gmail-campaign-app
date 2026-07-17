import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { SuppressionSchema, type Suppression } from "@/schemas/suppression";
import type { AuthContext } from "@/lib/auth/requireUser";

function userSuppressionsRef(ctx: AuthContext) {
  return firestore().collection("users").doc(ctx.userId).collection("suppressions");
}

function orgSuppressionsRef(ctx: AuthContext) {
  return firestore()
    .collection("organizations")
    .doc(ctx.organizationId)
    .collection("suppressions");
}

/** A lead is suppressed if an active suppression exists at either the
 * user scope or the organization scope. */
export async function isSuppressed(
  ctx: AuthContext,
  normalizedEmail: string
): Promise<Suppression | null> {
  const [userSnap, orgSnap] = await Promise.all([
    userSuppressionsRef(ctx)
      .where("normalizedEmail", "==", normalizedEmail)
      .where("active", "==", true)
      .limit(1)
      .get(),
    orgSuppressionsRef(ctx)
      .where("normalizedEmail", "==", normalizedEmail)
      .where("active", "==", true)
      .limit(1)
      .get(),
  ]);
  const doc = userSnap.docs[0] ?? orgSnap.docs[0];
  return doc ? SuppressionSchema.parse(doc.data()) : null;
}

export async function addSuppression(
  ctx: AuthContext,
  input: {
    email: string;
    normalizedEmail: string;
    reason: Suppression["reason"];
    scope: Suppression["scope"];
    source?: string;
    details?: string;
    campaignId?: string | null;
    recipientId?: string | null;
  }
): Promise<Suppression> {
  const now = Date.now();
  const suppressionId = crypto.randomUUID();
  const suppression = SuppressionSchema.parse({
    suppressionId,
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    normalizedEmail: input.normalizedEmail,
    email: input.email,
    reason: input.reason,
    scope: input.scope,
    source: input.source ?? "MANUAL",
    campaignId: input.campaignId ?? null,
    recipientId: input.recipientId ?? null,
    active: true,
    details: input.details ?? "",
    createdAt: now,
    updatedAt: now,
  });
  const ref =
    input.scope === "ORGANIZATION" ? orgSuppressionsRef(ctx) : userSuppressionsRef(ctx);
  await ref.doc(suppressionId).create(suppression);
  return suppression;
}

export async function listSuppressions(ctx: AuthContext, limit = 200): Promise<Suppression[]> {
  const snap = await userSuppressionsRef(ctx)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => SuppressionSchema.parse(d.data()));
}

export async function listOrgSuppressions(
  ctx: AuthContext,
  limit = 200
): Promise<Suppression[]> {
  const snap = await orgSuppressionsRef(ctx)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => SuppressionSchema.parse(d.data()));
}

/**
 * Deactivate (never delete) a suppression. Caller must have verified role
 * for ORGANIZATION scope. Writes an audit event alongside.
 */
export async function deactivateSuppression(
  ctx: AuthContext,
  suppressionId: string,
  scope: Suppression["scope"],
  reason: string
): Promise<boolean> {
  const ref =
    scope === "ORGANIZATION"
      ? orgSuppressionsRef(ctx).doc(suppressionId)
      : userSuppressionsRef(ctx).doc(suppressionId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const now = Date.now();
  await ref.update({ active: false, updatedAt: now });
  await firestore()
    .collection("users")
    .doc(ctx.userId)
    .collection("auditEvents")
    .add({
      type: "SUPPRESSION_REMOVED",
      ownerUserId: ctx.userId,
      organizationId: ctx.organizationId,
      createdByUserId: ctx.userId,
      suppressionId,
      scope,
      reason,
      createdAt: now,
    });
  return true;
}

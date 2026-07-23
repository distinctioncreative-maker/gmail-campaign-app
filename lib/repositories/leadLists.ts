import "server-only";
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import type { Scope } from "@/lib/repositories/scope";
import { LeadListSchema, type LeadList } from "@/schemas/leadList";

function listsRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("leadLists");
}

function contactsRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("contacts");
}

export async function listLeadLists(ctx: Scope): Promise<LeadList[]> {
  const snap = await listsRef(ctx).limit(200).get();
  return snap.docs
    .map((d) => LeadListSchema.parse(d.data()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getLeadList(ctx: Scope, listId: string): Promise<LeadList | null> {
  const snap = await listsRef(ctx).doc(listId).get();
  return snap.exists ? LeadListSchema.parse(snap.data()) : null;
}

export async function createLeadList(ctx: Scope, name: string): Promise<LeadList> {
  const now = Date.now();
  const list: LeadList = LeadListSchema.parse({
    listId: crypto.randomUUID(),
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    name,
    count: 0,
    createdAt: now,
    updatedAt: now,
  });
  await listsRef(ctx).doc(list.listId).create(list);
  return list;
}

export async function renameLeadList(ctx: Scope, listId: string, name: string): Promise<void> {
  await listsRef(ctx).doc(listId).update({ name, updatedAt: Date.now() });
}

/** Adjust the denormalized member count by a delta and touch updatedAt. */
export async function bumpLeadListCount(ctx: Scope, listId: string, delta: number): Promise<void> {
  if (delta === 0) {
    await listsRef(ctx).doc(listId).update({ updatedAt: Date.now() }).catch(() => {});
    return;
  }
  await listsRef(ctx)
    .doc(listId)
    .update({ count: FieldValue.increment(delta), updatedAt: Date.now() })
    .catch(() => {});
}

/** Delete a list and remove its id from every member contact. */
export async function deleteLeadList(ctx: Scope, listId: string): Promise<void> {
  const members = await contactsRef(ctx).where("listIds", "array-contains", listId).get();
  const db = firestore();
  for (let i = 0; i < members.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of members.docs.slice(i, i + 400)) {
      batch.update(doc.ref, { listIds: FieldValue.arrayRemove(listId), updatedAt: Date.now() });
    }
    await batch.commit();
  }
  await listsRef(ctx).doc(listId).delete();
}

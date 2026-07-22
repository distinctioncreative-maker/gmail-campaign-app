import "server-only";
import crypto from "node:crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import type { Scope } from "@/lib/repositories/scope";
import type { AuthContext } from "@/lib/auth/requireUser";
import {
  CampaignSchema,
  CampaignEventSchema,
  QueueItemSchema,
  RecipientSchema,
  type Campaign,
  type CampaignEvent,
  type CampaignStatus,
  type QueueItem,
  type Recipient,
} from "@/schemas/campaign";

/** Owner identity for worker paths, where there is no session AuthContext.
 * Workers derive this from the task payload and re-verify document paths. */
export type OwnerRef = Scope;

export function ownerFromCtx(ctx: AuthContext): OwnerRef {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

function userRef(owner: OwnerRef) {
  return firestore().collection("users").doc(owner.userId);
}

function campaignsRef(owner: OwnerRef) {
  return userRef(owner).collection("campaigns");
}

function campaignRef(owner: OwnerRef, campaignId: string) {
  return campaignsRef(owner).doc(campaignId);
}

export function recipientsRef(owner: OwnerRef, campaignId: string) {
  return campaignRef(owner, campaignId).collection("recipients");
}

export function queueRef(owner: OwnerRef, campaignId: string) {
  return campaignRef(owner, campaignId).collection("queue");
}

function eventsRef(owner: OwnerRef, campaignId: string) {
  return campaignRef(owner, campaignId).collection("events");
}

function messagesRef(owner: OwnerRef, campaignId: string) {
  return campaignRef(owner, campaignId).collection("messages");
}

// ── Campaign CRUD ────────────────────────────────────────────────

export async function createCampaign(
  ctx: AuthContext,
  input: Omit<
    Campaign,
    | "campaignId" | "ownerUserId" | "organizationId" | "createdByUserId"
    | "createdAt" | "updatedAt"
  >
): Promise<Campaign> {
  const now = Date.now();
  const campaignId = crypto.randomUUID();
  const campaign = CampaignSchema.parse({
    ...input,
    campaignId,
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    createdAt: now,
    updatedAt: now,
  });
  await campaignRef(ownerFromCtx(ctx), campaignId).create(campaign);
  return campaign;
}

export async function getCampaign(
  owner: OwnerRef,
  campaignId: string
): Promise<Campaign | null> {
  const snap = await campaignRef(owner, campaignId).get();
  return snap.exists ? CampaignSchema.parse(snap.data()) : null;
}

/**
 * Permanently delete a campaign and all of its subcollections (recipients,
 * queue, events, messages). Uses Firestore recursiveDelete so nothing is left
 * orphaned. Callers must enforce the DRAFT-only policy before calling.
 */
export async function deleteCampaign(owner: OwnerRef, campaignId: string): Promise<void> {
  await firestore().recursiveDelete(campaignRef(owner, campaignId));
}

export async function listCampaigns(owner: OwnerRef, limit = 100): Promise<Campaign[]> {
  const snap = await campaignsRef(owner).orderBy("updatedAt", "desc").limit(limit).get();
  return snap.docs.map((d) => CampaignSchema.parse(d.data()));
}

export async function updateCampaign(
  owner: OwnerRef,
  campaignId: string,
  patch: Partial<Campaign>
): Promise<void> {
  await campaignRef(owner, campaignId).update({ ...patch, updatedAt: Date.now() });
}

export async function setCampaignStatus(
  owner: OwnerRef,
  campaignId: string,
  status: CampaignStatus,
  extra: Partial<Campaign> = {}
): Promise<void> {
  await updateCampaign(owner, campaignId, { status, ...extra });
}

export async function incrementCampaignCounters(
  owner: OwnerRef,
  campaignId: string,
  counters: Partial<
    Record<
      | "sentCount" | "draftedCount" | "replyCount" | "bounceCount"
      | "unsubscribeCount" | "followupSentCount" | "errorCount",
      number
    >
  >
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(counters)) update[k] = FieldValue.increment(v);
  await campaignRef(owner, campaignId).update(update);
}

// ── Recipients ───────────────────────────────────────────────────

export async function batchCreateRecipients(
  owner: OwnerRef,
  campaignId: string,
  recipients: Recipient[]
): Promise<void> {
  const db = firestore();
  // Firestore batches cap at 500 writes.
  for (let i = 0; i < recipients.length; i += 450) {
    const batch = db.batch();
    for (const r of recipients.slice(i, i + 450)) {
      batch.set(recipientsRef(owner, campaignId).doc(r.recipientId), r);
    }
    await batch.commit();
  }
}

export async function getRecipient(
  owner: OwnerRef,
  campaignId: string,
  recipientId: string
): Promise<Recipient | null> {
  const snap = await recipientsRef(owner, campaignId).doc(recipientId).get();
  return snap.exists ? RecipientSchema.parse(snap.data()) : null;
}

export async function listRecipients(
  owner: OwnerRef,
  campaignId: string,
  limit = 1000
): Promise<Recipient[]> {
  const snap = await recipientsRef(owner, campaignId).orderBy("createdAt", "asc").limit(limit).get();
  return snap.docs.map((d) => RecipientSchema.parse(d.data()));
}

export async function updateRecipient(
  owner: OwnerRef,
  campaignId: string,
  recipientId: string,
  patch: Partial<Recipient>
): Promise<void> {
  await recipientsRef(owner, campaignId)
    .doc(recipientId)
    .update({ ...patch, updatedAt: Date.now() });
}

// ── Queue items ──────────────────────────────────────────────────

export async function batchCreateQueueItems(
  owner: OwnerRef,
  campaignId: string,
  items: QueueItem[]
): Promise<void> {
  const db = firestore();
  for (let i = 0; i < items.length; i += 450) {
    const batch = db.batch();
    for (const item of items.slice(i, i + 450)) {
      batch.set(queueRef(owner, campaignId).doc(item.queueItemId), item);
    }
    await batch.commit();
  }
}

export async function getQueueItem(
  owner: OwnerRef,
  campaignId: string,
  queueItemId: string
): Promise<QueueItem | null> {
  const snap = await queueRef(owner, campaignId).doc(queueItemId).get();
  return snap.exists ? QueueItemSchema.parse(snap.data()) : null;
}

export async function updateQueueItem(
  owner: OwnerRef,
  campaignId: string,
  queueItemId: string,
  patch: Partial<QueueItem>
): Promise<void> {
  await queueRef(owner, campaignId)
    .doc(queueItemId)
    .update({ ...patch, updatedAt: Date.now() });
}

/**
 * Transactionally claim a queue item for processing. Returns the claimed
 * item, or null when it is not claimable (already complete, cancelled,
 * processing elsewhere) — which makes duplicate Cloud Tasks delivery a
 * harmless no-op.
 */
export async function claimQueueItem(
  owner: OwnerRef,
  campaignId: string,
  queueItemId: string
): Promise<QueueItem | null> {
  const db = firestore();
  const ref = queueRef(owner, campaignId).doc(queueItemId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const item = QueueItemSchema.parse(snap.data());
    if (item.status !== "PENDING" && item.status !== "SCHEDULED" && item.status !== "RETRY_SCHEDULED") {
      return null;
    }
    const claimed: QueueItem = {
      ...item,
      status: "PROCESSING",
      attemptCount: item.attemptCount + 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    tx.set(ref, claimed);
    return claimed;
  });
}

export async function listQueueItems(
  owner: OwnerRef,
  campaignId: string,
  statuses?: QueueItem["status"][]
): Promise<QueueItem[]> {
  let q = queueRef(owner, campaignId).orderBy("scheduledAt", "asc").limit(2000);
  if (statuses && statuses.length > 0 && statuses.length <= 10) {
    q = queueRef(owner, campaignId)
      .where("status", "in", statuses)
      .orderBy("scheduledAt", "asc")
      .limit(2000);
  }
  const snap = await q.get();
  return snap.docs.map((d) => QueueItemSchema.parse(d.data()));
}

// ── Messages (idempotency records) ───────────────────────────────

/**
 * Reserve an idempotency key inside a transaction, recording the send.
 * Returns false when the key already exists — the message was already sent
 * and MUST NOT be sent again.
 */
export async function reserveIdempotencyKey(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string,
  record: { queueItemId: string; recipientId: string }
): Promise<boolean> {
  const db = firestore();
  // Key is the doc ID: existence == used. Keys contain ':' which is legal.
  const ref = messagesRef(owner, campaignId).doc(idempotencyKey.replaceAll("/", "_"));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      idempotencyKey,
      ...record,
      ownerUserId: owner.userId,
      organizationId: owner.organizationId,
      campaignId,
      status: "RESERVED",
      createdAt: Date.now(),
    });
    return true;
  });
}

export async function finalizeMessage(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string,
  result: { gmailMessageId: string; gmailThreadId: string; sentTo: string; subject: string }
): Promise<void> {
  await messagesRef(owner, campaignId)
    .doc(idempotencyKey.replaceAll("/", "_"))
    .set(
      { ...result, status: "SENT", sentAt: Date.now() },
      { merge: true }
    );
}

export async function isIdempotencyKeyUsed(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string
): Promise<boolean> {
  const snap = await messagesRef(owner, campaignId)
    .doc(idempotencyKey.replaceAll("/", "_"))
    .get();
  return snap.exists && snap.data()?.status === "SENT";
}

// ── Daily send counters ──────────────────────────────────────────

/** Transactionally increment today's send counter; returns the new count. */
export async function incrementDailyCounter(
  owner: OwnerRef,
  dayKey: string
): Promise<number> {
  const ref = userRef(owner).collection("counters").doc(dayKey);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.data()?.sent as number | undefined) ?? 0;
    tx.set(ref, { sent: current + 1, updatedAt: Date.now() }, { merge: true });
    return current + 1;
  });
}

/** Cheap per-day activity rollup on the same counters doc the send limiter
 * uses — replies/bounces/unsubscribes accrue next to `sent`, so daily trend
 * dashboards never need recipient-level scans. */
export async function incrementDailyActivity(
  owner: OwnerRef,
  dayKey: string,
  field: "replies" | "bounces" | "unsubscribes"
): Promise<void> {
  await userRef(owner)
    .collection("counters")
    .doc(dayKey)
    .set({ [field]: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
}

export async function getDailyCount(owner: OwnerRef, dayKey: string): Promise<number> {
  const snap = await userRef(owner).collection("counters").doc(dayKey).get();
  return (snap.data()?.sent as number | undefined) ?? 0;
}

// ── Events (friendly activity feed) ──────────────────────────────

export async function recordEvent(
  owner: OwnerRef,
  campaignId: string,
  event: Omit<CampaignEvent, "eventId" | "campaignId" | "ownerUserId" | "organizationId" | "createdAt">
): Promise<void> {
  const eventId = crypto.randomUUID();
  const full = CampaignEventSchema.parse({
    ...event,
    eventId,
    campaignId,
    ownerUserId: owner.userId,
    organizationId: owner.organizationId,
    createdAt: Date.now(),
  });
  await eventsRef(owner, campaignId).doc(eventId).set(full);
}

export async function listEvents(
  owner: OwnerRef,
  campaignId: string,
  limit = 100
): Promise<CampaignEvent[]> {
  const snap = await eventsRef(owner, campaignId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => CampaignEventSchema.parse(d.data()));
}

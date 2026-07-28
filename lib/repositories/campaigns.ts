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
    | "createdAt" | "updatedAt" | "launchStartedAt"
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

export async function listCampaigns(
  owner: OwnerRef,
  maxItems = 100
): Promise<Campaign[]> {
  const rows: Campaign[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (rows.length < maxItems) {
    const pageSize = Math.min(500, maxItems - rows.length);
    let query = campaignsRef(owner)
      .orderBy("updatedAt", "desc")
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    rows.push(...snap.docs.map((doc) => CampaignSchema.parse(doc.data())));
    if (snap.empty || snap.size < pageSize) break;
    cursor = snap.docs.at(-1) ?? null;
  }
  return rows;
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

/** Atomically move a launchable campaign into PREPARING. Exactly one request
 * can win, so double-clicks, concurrent tabs, and HTTP retries cannot create
 * separate recipient/queue generations. */
export async function claimCampaignLaunch(
  owner: OwnerRef,
  campaignId: string
): Promise<Campaign | null> {
  const ref = campaignRef(owner, campaignId);
  return firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const campaign = CampaignSchema.parse(snap.data());
    if (campaign.status !== "DRAFT" && campaign.status !== "READY") return null;
    const claimed = CampaignSchema.parse({
      ...campaign,
      status: "PREPARING",
      launchStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
    tx.set(ref, claimed);
    return claimed;
  });
}

/** Release a failed pre-activation launch. This is conditional so an ACTIVE
 * campaign can never be rolled backward by a late error handler. */
export async function releaseCampaignLaunch(
  owner: OwnerRef,
  campaignId: string
): Promise<void> {
  const ref = campaignRef(owner, campaignId);
  await firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== "PREPARING") return;
    tx.update(ref, {
      status: "READY",
      launchStartedAt: null,
      updatedAt: Date.now(),
    });
  });
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
  maxItems = Number.POSITIVE_INFINITY
): Promise<Recipient[]> {
  const rows: Recipient[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (rows.length < maxItems) {
    const pageSize = Math.min(500, maxItems - rows.length);
    let query = recipientsRef(owner, campaignId).orderBy("createdAt", "asc").limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    rows.push(...snap.docs.map((d) => RecipientSchema.parse(d.data())));
    if (snap.empty || snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return rows;
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

/** Atomic engagement updates avoid losing increments when email clients load
 * the same tracking URL concurrently. */
export async function recordRecipientOpen(
  owner: OwnerRef,
  campaignId: string,
  recipientId: string,
  at: number
): Promise<void> {
  const ref = recipientsRef(owner, campaignId).doc(recipientId);
  await firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    tx.update(ref, {
      openedAt: data.openedAt ?? at,
      openCount: FieldValue.increment(1),
      updatedAt: at,
    });
  });
}

export async function recordRecipientClick(
  owner: OwnerRef,
  campaignId: string,
  recipientId: string,
  at: number
): Promise<void> {
  const ref = recipientsRef(owner, campaignId).doc(recipientId);
  await firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    tx.update(ref, {
      firstClickedAt: data.firstClickedAt ?? at,
      clickCount: FieldValue.increment(1),
      openedAt: data.openedAt ?? at,
      // Count an implied open only when this is the first engagement.
      ...(data.openedAt ? {} : { openCount: FieldValue.increment(1) }),
      updatedAt: at,
    });
  });
}

/**
 * Atomically claim a mailbox outcome and increment its campaign counter.
 * Concurrent Scheduler/manual scans can observe the same Gmail message, but
 * exactly one is allowed to apply side effects.
 */
export async function commitRecipientOutcome(
  owner: OwnerRef,
  campaignId: string,
  recipientId: string,
  outcome: "REPLY" | "UNSUBSCRIBE" | "BOUNCE",
  patch: Partial<Recipient>,
  dayKey: string
): Promise<boolean> {
  const recipient = recipientsRef(owner, campaignId).doc(recipientId);
  const campaign = campaignRef(owner, campaignId);
  const daily = userRef(owner).collection("counters").doc(dayKey);
  return firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(recipient);
    if (!snap.exists) return false;
    const current = RecipientSchema.parse(snap.data());
    const alreadyApplied =
      outcome === "REPLY"
        ? current.repliedAt !== null
        : outcome === "UNSUBSCRIBE"
          ? current.unsubscribedAt !== null
          : current.bouncedAt !== null;
    if (alreadyApplied) return false;
    const counter =
      outcome === "REPLY"
        ? "replyCount"
        : outcome === "UNSUBSCRIBE"
          ? "unsubscribeCount"
          : "bounceCount";
    const now = Date.now();
    tx.update(recipient, { ...patch, updatedAt: now });
    tx.update(campaign, {
      [counter]: FieldValue.increment(1),
      updatedAt: now,
    });
    const dailyField =
      outcome === "REPLY"
        ? "replies"
        : outcome === "UNSUBSCRIBE"
          ? "unsubscribes"
          : "bounces";
    tx.set(
      daily,
      { [dailyField]: FieldValue.increment(1), updatedAt: now },
      { merge: true }
    );
    return true;
  });
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
      cloudTaskName: null,
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
  const rows: QueueItem[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let q = queueRef(owner, campaignId).orderBy("scheduledAt", "asc").limit(500);
    if (statuses && statuses.length > 0 && statuses.length <= 10) {
      q = queueRef(owner, campaignId)
        .where("status", "in", statuses)
        .orderBy("scheduledAt", "asc")
        .limit(500);
    }
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    rows.push(...snap.docs.map((d) => QueueItemSchema.parse(d.data())));
    if (snap.empty || snap.size < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return rows;
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
    // Any existing reservation means a delivery attempt may already have
    // reached Gmail. Never infer "safe to retry" from an unfinished record.
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

/**
 * Atomically commit the authoritative result of a Gmail delivery. Message,
 * recipient, queue, and cached campaign counters either all advance or none
 * do, eliminating post-send metric/state drift.
 */
export async function commitDeliveryResult(
  owner: OwnerRef,
  campaignId: string,
  input: {
    idempotencyKey: string;
    queueItemId: string;
    recipientId: string;
    recipientPatch: Partial<Recipient>;
    counter: "sentCount" | "followupSentCount" | "draftedCount";
    completedAt: number;
    /** Durable outbox record for the next follow-up, created in this same
     * transaction. Cloud Task publication happens after the commit. */
    nextQueueItem?: QueueItem | null;
    result: {
      gmailMessageId: string;
      gmailThreadId: string;
      sentTo: string;
      subject: string;
      status: "SENT" | "DRAFTED";
      gmailDraftId?: string;
    };
  }
): Promise<{ nextFollowupCommitted: boolean }> {
  const db = firestore();
  const message = messagesRef(owner, campaignId).doc(
    input.idempotencyKey.replaceAll("/", "_")
  );
  const recipient = recipientsRef(owner, campaignId).doc(input.recipientId);
  const queue = queueRef(owner, campaignId).doc(input.queueItemId);
  const campaign = campaignRef(owner, campaignId);

  return db.runTransaction(async (tx: Transaction) => {
    const [messageSnap, recipientSnap, campaignSnap] = await Promise.all([
      tx.get(message),
      tx.get(recipient),
      tx.get(campaign),
    ]);
    if (!messageSnap.exists || messageSnap.data()?.status !== "RESERVED") {
      throw new Error("Delivery reservation is not in a committable state");
    }
    if (!recipientSnap.exists) {
      throw new Error("Delivery recipient no longer exists");
    }
    if (!campaignSnap.exists) {
      throw new Error("Delivery campaign no longer exists");
    }
    const currentRecipient = RecipientSchema.parse(recipientSnap.data());
    const currentCampaign = CampaignSchema.parse(campaignSnap.data());
    const preserveTerminalStatus =
      currentRecipient.repliedAt !== null
        ? "REPLIED"
        : currentRecipient.unsubscribedAt !== null
          ? "UNSUBSCRIBED"
          : currentRecipient.bouncedAt !== null
            ? "BOUNCED"
            : null;
    const nextFollowupCommitted =
      input.nextQueueItem !== null &&
      input.nextQueueItem !== undefined &&
      preserveTerminalStatus === null &&
      (currentCampaign.status === "ACTIVE" || currentCampaign.status === "PAUSED");
    tx.set(
      message,
      {
        ...input.result,
        [input.result.status === "DRAFTED" ? "draftedAt" : "sentAt"]:
          input.completedAt,
      },
      { merge: true }
    );
    tx.update(recipient, {
      ...input.recipientPatch,
      ...(input.nextQueueItem
        ? {
            nextFollowupAt: nextFollowupCommitted
              ? input.nextQueueItem.scheduledAt
              : null,
          }
        : {}),
      ...(preserveTerminalStatus ? { status: preserveTerminalStatus } : {}),
      updatedAt: input.completedAt,
    });
    tx.update(queue, {
      status: "COMPLETE",
      completedAt: input.completedAt,
      lastError: null,
      updatedAt: input.completedAt,
    });
    tx.update(campaign, {
      [input.counter]: FieldValue.increment(1),
      updatedAt: input.completedAt,
    });
    if (nextFollowupCommitted && input.nextQueueItem) {
      tx.set(
        queueRef(owner, campaignId).doc(input.nextQueueItem.queueItemId),
        input.nextQueueItem
      );
    }
    return { nextFollowupCommitted };
  });
}

export async function isIdempotencyKeyUsed(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string
): Promise<boolean> {
  const snap = await messagesRef(owner, campaignId)
    .doc(idempotencyKey.replaceAll("/", "_"))
    .get();
  return snap.exists;
}

export async function getIdempotencyStatus(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string
): Promise<"RESERVED" | "SENT" | "DRAFTED" | null> {
  const snap = await messagesRef(owner, campaignId)
    .doc(idempotencyKey.replaceAll("/", "_"))
    .get();
  const status = snap.data()?.status;
  return status === "RESERVED" || status === "SENT" || status === "DRAFTED"
    ? status
    : null;
}

// ── Daily send counters ──────────────────────────────────────────

export async function getDailyCount(owner: OwnerRef, dayKey: string): Promise<number> {
  const snap = await userRef(owner).collection("counters").doc(dayKey).get();
  return (snap.data()?.sent as number | undefined) ?? 0;
}

/**
 * Atomically reserve one unit of today's send allowance. The reservation is
 * keyed by the message idempotency key, so a crash before the Gmail call can
 * retry without consuming a second unit, while concurrent workers can never
 * collectively pass the cap.
 */
export async function reserveDailySend(
  owner: OwnerRef,
  dayKey: string,
  limit: number,
  idempotencyKey: string
): Promise<{ reserved: boolean; count: number }> {
  const counter = userRef(owner).collection("counters").doc(dayKey);
  const reservation = counter
    .collection("sendReservations")
    .doc(idempotencyKey.replaceAll("/", "_"));
  return firestore().runTransaction(async (tx: Transaction) => {
    const [counterSnap, reservationSnap] = await Promise.all([
      tx.get(counter),
      tx.get(reservation),
    ]);
    const current = (counterSnap.data()?.sent as number | undefined) ?? 0;
    if (reservationSnap.exists) return { reserved: true, count: current };
    if (current >= limit) return { reserved: false, count: current };
    tx.set(
      counter,
      { sent: current + 1, updatedAt: Date.now() },
      { merge: true }
    );
    tx.create(reservation, {
      idempotencyKey,
      reservedAt: Date.now(),
    });
    return { reserved: true, count: current + 1 };
  });
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

/** Claim the once-per-day right to mass-defer a campaign's queue. Returns
 * true for exactly one caller per (campaign, dayKey) — everyone else gets
 * false and must not re-spread the queue again. */
export async function claimDeferralForDay(
  owner: OwnerRef,
  campaignId: string,
  dayKey: string
): Promise<boolean> {
  const ref = campaignRef(owner, campaignId);
  return firestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const current = (snap.data()?.deferredDayKey as string | null) ?? null;
    if (current === dayKey) return false;
    tx.update(ref, { deferredDayKey: dayKey, updatedAt: Date.now() });
    return true;
  });
}

export interface DailyActivityRow {
  day: string; // YYYY-MM-DD
  sent: number;
  replied: number;
}

/** Last-N-days activity from the per-day counter docs — one getAll, no
 * recipient scans. Powers the Home pulse chart. */
export async function getDailyActivity(
  owner: OwnerRef,
  timezone: string,
  days = 14
): Promise<DailyActivityRow[]> {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now - i * DAY));
    if (!keys.includes(key)) keys.push(key);
  }
  const refs = keys.map((k) => userRef(owner).collection("counters").doc(k));
  const snaps = await firestore().getAll(...refs);
  return snaps.map((snap, i) => ({
    day: keys[i],
    sent: (snap.data()?.sent as number | undefined) ?? 0,
    replied: (snap.data()?.replies as number | undefined) ?? 0,
  }));
}

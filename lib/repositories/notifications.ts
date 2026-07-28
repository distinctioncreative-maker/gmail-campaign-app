import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { Transaction } from "firebase-admin/firestore";
import type { Scope } from "@/lib/repositories/scope";

export interface AppNotification {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "SUCCESS";
  campaignId: string | null;
  read: boolean;
  createdAt: number;
}

function notificationsRef(scope: Scope) {
  return firestore().collection("users").doc(scope.userId).collection("notifications");
}

type NotificationInput = {
  type: string;
  title: string;
  body: string;
  severity?: "INFO" | "WARNING" | "SUCCESS";
  campaignId?: string | null;
};

function notificationRecord(
  notificationId: string,
  input: NotificationInput,
  createdAt = Date.now()
): AppNotification {
  return {
    notificationId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity ?? "INFO",
    campaignId: input.campaignId ?? null,
    read: false,
    createdAt,
  };
}

export function notificationStableId(stableKey: string): string {
  return crypto.createHash("sha256").update(stableKey).digest("hex");
}

export async function addNotification(
  scope: Scope,
  input: NotificationInput
): Promise<void> {
  const notificationId = crypto.randomUUID();
  await notificationsRef(scope)
    .doc(notificationId)
    .set(notificationRecord(notificationId, input));
}

/**
 * Write a notification as part of an existing transaction. A stable key lets
 * event producers deduplicate noisy signals without a second race-prone write.
 */
export function setNotificationOnce(
  tx: Transaction,
  scope: Scope,
  stableKey: string,
  input: NotificationInput,
  createdAt: number
): void {
  const notificationId = notificationStableId(stableKey);
  tx.set(
    notificationsRef(scope).doc(notificationId),
    notificationRecord(notificationId, input, createdAt)
  );
}

export async function listNotifications(scope: Scope, limit = 30): Promise<AppNotification[]> {
  const snap = await notificationsRef(scope).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as AppNotification);
}

export async function markAllRead(scope: Scope): Promise<void> {
  const snap = await notificationsRef(scope).where("read", "==", false).limit(200).get();
  const batch = firestore().batch();
  for (const doc of snap.docs) batch.update(doc.ref, { read: true });
  await batch.commit();
}

import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
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

export async function addNotification(
  scope: Scope,
  input: {
    type: string;
    title: string;
    body: string;
    severity?: "INFO" | "WARNING" | "SUCCESS";
    campaignId?: string | null;
  }
): Promise<void> {
  const notificationId = crypto.randomUUID();
  await notificationsRef(scope).doc(notificationId).set({
    notificationId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity ?? "INFO",
    campaignId: input.campaignId ?? null,
    read: false,
    createdAt: Date.now(),
  });
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

import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { Role } from "@/schemas/common";

export interface PendingInvite {
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: number;
}

export interface InviteRecord extends PendingInvite {
  status: "PENDING" | "ACCEPTED";
  acceptedByUserId: string | null;
}

function emailKey(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
}

function orgInvitesRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId).collection("invites");
}
/** Global email → invite pointer, so sign-in can resolve an invite in one read
 * instead of scanning every org. */
function pointerRef(email: string) {
  return firestore().collection("pendingInvites").doc(emailKey(email));
}

/** Create (or refresh) an invite for an email into an org. Writes both the
 * org-scoped record (for listing/management) and the global pointer. */
export async function createInvite(input: {
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();
  const record: InviteRecord = {
    organizationId: input.organizationId,
    email,
    role: input.role,
    invitedBy: input.invitedBy,
    createdAt: now,
    status: "PENDING",
    acceptedByUserId: null,
  };
  await Promise.all([
    orgInvitesRef(input.organizationId).doc(emailKey(email)).set(record),
    pointerRef(email).set({
      organizationId: input.organizationId,
      email,
      role: input.role,
      invitedBy: input.invitedBy,
      createdAt: now,
    } satisfies PendingInvite),
  ]);
}

/** Single-read lookup used at sign-in: is there a pending invite for this
 * email? Returns null when none. */
export async function getPendingInvite(email: string): Promise<PendingInvite | null> {
  const snap = await pointerRef(email).get();
  return snap.exists ? (snap.data() as PendingInvite) : null;
}

/** Mark an invite accepted and drop the global pointer so it can't be reused. */
export async function consumeInvite(email: string, userId: string): Promise<void> {
  const invite = await getPendingInvite(email);
  await pointerRef(email).delete();
  if (invite) {
    await orgInvitesRef(invite.organizationId)
      .doc(emailKey(email))
      .set({ status: "ACCEPTED", acceptedByUserId: userId, acceptedAt: Date.now() }, { merge: true });
  }
}

export async function listInvites(organizationId: string): Promise<InviteRecord[]> {
  const snap = await orgInvitesRef(organizationId).orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => d.data() as InviteRecord);
}

/** Revoke a still-pending invite (removes the pointer and the record). */
export async function revokeInvite(organizationId: string, email: string): Promise<void> {
  const key = emailKey(email);
  await Promise.all([
    orgInvitesRef(organizationId).doc(key).delete(),
    pointerRef(email).delete(),
  ]);
}

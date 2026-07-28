import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { Role } from "@/schemas/common";
import {
  MemberSchema,
  UserSchema,
  type Member,
  type TenantType,
  type User,
} from "@/schemas/user";

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
export type CreateInviteResult =
  | "CREATED"
  | "EMAIL_IN_OTHER_WORKSPACE"
  | "ALREADY_MEMBER"
  | "SEAT_LIMIT";

export async function createInvite(input: {
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: string;
  /** null keeps grandfathered/non-Stripe workspaces unrestricted. */
  maxSeats: number | null;
}): Promise<CreateInviteResult> {
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
  const orgInvite = orgInvitesRef(input.organizationId).doc(emailKey(email));
  const pointer = pointerRef(email);
  return firestore().runTransaction(async (tx) => {
    const members = firestore()
      .collection("organizations")
      .doc(input.organizationId)
      .collection("members");
    const [pointerSnap, matchingMemberSnap, currentInviteSnap] = await Promise.all([
      tx.get(pointer),
      tx.get(members.where("email", "==", email).limit(1)),
      tx.get(orgInvite),
    ]);
    if (
      pointerSnap.exists &&
      pointerSnap.data()?.organizationId !== input.organizationId
    ) {
      return "EMAIL_IN_OTHER_WORKSPACE";
    }
    if (!matchingMemberSnap.empty) {
      return "ALREADY_MEMBER";
    }

    if (input.maxSeats !== null) {
      const [activeMembersSnap, pendingInvitesSnap] = await Promise.all([
        tx.get(members.where("active", "==", true).limit(input.maxSeats + 1)),
        tx.get(
          orgInvitesRef(input.organizationId)
            .where("status", "==", "PENDING")
            .limit(input.maxSeats + 1)
        ),
      ]);
      const refreshingCurrentInvite =
        currentInviteSnap.exists && currentInviteSnap.data()?.status === "PENDING";
      const reservedSeats =
        activeMembersSnap.size +
        pendingInvitesSnap.size -
        (refreshingCurrentInvite ? 1 : 0);
      if (reservedSeats >= input.maxSeats) {
        return "SEAT_LIMIT";
      }
    }
    tx.set(orgInvite, record);
    tx.set(pointer, {
      organizationId: input.organizationId,
      email,
      role: input.role,
      invitedBy: input.invitedBy,
      createdAt: now,
    } satisfies PendingInvite);
    return "CREATED";
  });
}

/** Single-read lookup used at sign-in: is there a pending invite for this
 * email? Returns null when none. */
export async function getPendingInvite(email: string): Promise<PendingInvite | null> {
  const snap = await pointerRef(email).get();
  return snap.exists ? (snap.data() as PendingInvite) : null;
}

/**
 * Atomically verify/consume an invite and provision both the member and user.
 * Revocation racing a first sign-in therefore either wins completely or loses
 * completely; it can never leave an unauthorized membership behind.
 */
export async function acceptInviteAndProvision(input: {
  email: string;
  userId: string;
  displayName: string;
  expectedOrganizationId: string;
  tenantType: TenantType;
}): Promise<{ member: Member; user: User } | null> {
  const email = input.email.trim().toLowerCase();
  const pointer = pointerRef(email);
  const db = firestore();
  const org = db.collection("organizations").doc(input.expectedOrganizationId);
  const memberRef = org.collection("members").doc(input.userId);
  const userRef = db.collection("users").doc(input.userId);
  return db.runTransaction(async (tx) => {
    const [pointerSnap, orgSnap, memberSnap, userSnap] = await Promise.all([
      tx.get(pointer),
      tx.get(org),
      tx.get(memberRef),
      tx.get(userRef),
    ]);
    if (!pointerSnap.exists || !orgSnap.exists) return null;
    const invite = pointerSnap.data() as PendingInvite;
    if (
      invite.organizationId !== input.expectedOrganizationId ||
      invite.email !== email
    ) {
      return null;
    }
    if (
      userSnap.exists &&
      userSnap.data()?.organizationId !== invite.organizationId
    ) {
      return null;
    }
    const now = Date.now();
    const member = memberSnap.exists
      ? MemberSchema.parse(memberSnap.data())
      : MemberSchema.parse({
          userId: input.userId,
          organizationId: invite.organizationId,
          email,
          role: invite.role,
          active: true,
          teamId: null,
          createdAt: now,
          updatedAt: now,
        });
    const user = userSnap.exists
      ? UserSchema.parse(userSnap.data())
      : UserSchema.parse({
          userId: input.userId,
          organizationId: invite.organizationId,
          email,
          displayName: input.displayName,
          role: member.role,
          tenantType: input.tenantType,
          active: true,
          onboardingStatus: "NEW",
          timezone: "America/New_York",
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        });
    if (!memberSnap.exists) tx.create(memberRef, member);
    if (!userSnap.exists) tx.create(userRef, user);
    tx.delete(pointer);
    tx.set(
      orgInvitesRef(invite.organizationId).doc(emailKey(email)),
      {
        status: "ACCEPTED",
        acceptedByUserId: input.userId,
        acceptedAt: now,
      },
      { merge: true }
    );
    return { member, user };
  });
}

export async function listInvites(organizationId: string): Promise<InviteRecord[]> {
  const snap = await orgInvitesRef(organizationId).orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => d.data() as InviteRecord);
}

/** Revoke a still-pending invite (removes the pointer and the record). */
export async function revokeInvite(organizationId: string, email: string): Promise<void> {
  const key = emailKey(email);
  const pointer = pointerRef(email);
  await firestore().runTransaction(async (tx) => {
    const pointerSnap = await tx.get(pointer);
    tx.delete(orgInvitesRef(organizationId).doc(key));
    if (
      pointerSnap.exists &&
      pointerSnap.data()?.organizationId === organizationId
    ) {
      tx.delete(pointer);
    }
  });
}

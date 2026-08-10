import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { UserSchema, type User, type TenantType } from "@/schemas/user";
import type { Role } from "@/schemas/common";

export async function getUser(userId: string): Promise<User | null> {
  const snap = await firestore().collection("users").doc(userId).get();
  return snap.exists ? UserSchema.parse(snap.data()) : null;
}

export async function createUser(input: {
  userId: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: Role;
  tenantType: TenantType;
}): Promise<User> {
  const now = Date.now();
  const user: User = {
    ...input,
    roleLabel: null,
    active: true,
    onboardingStatus: "NEW",
    timezone: "America/New_York",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    startersSeededAt: null,
    sessionsRevokedAt: null,
  };
  const ref = firestore().collection("users").doc(user.userId);
  return firestore().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return UserSchema.parse(existing.data());
    tx.create(ref, user);
    return user;
  });
}

export async function touchLastLogin(userId: string): Promise<void> {
  const now = Date.now();
  await firestore().collection("users").doc(userId).update({
    lastLoginAt: now,
    updatedAt: now,
  });
}

export async function updateOnboardingStatus(
  userId: string,
  onboardingStatus: User["onboardingStatus"]
): Promise<void> {
  await firestore().collection("users").doc(userId).update({
    onboardingStatus,
    updatedAt: Date.now(),
  });
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  await firestore().collection("users").doc(userId).update({
    displayName,
    updatedAt: Date.now(),
  });
}

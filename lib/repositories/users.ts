import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { UserSchema, type User } from "@/schemas/user";
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
}): Promise<User> {
  const now = Date.now();
  const user: User = {
    ...input,
    active: true,
    onboardingStatus: "NEW",
    timezone: "America/New_York",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  await firestore().collection("users").doc(user.userId).create(user);
  return user;
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

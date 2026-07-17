import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import {
  MemberSchema,
  OrganizationSchema,
  type Member,
  type Organization,
} from "@/schemas/user";
import type { Role } from "@/schemas/common";

const DEFAULT_ORG_ID = "default";

export async function getOrCreateDefaultOrganization(): Promise<Organization> {
  const db = firestore();
  const ref = db.collection("organizations").doc(DEFAULT_ORG_ID);
  const snap = await ref.get();
  if (snap.exists) return OrganizationSchema.parse(snap.data());

  const now = Date.now();
  const org: Organization = {
    organizationId: DEFAULT_ORG_ID,
    name: env.DEFAULT_ORGANIZATION_NAME,
    allowedDomain: env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN,
    collisionPolicy: "OFF",
    collisionBlockDays: 30,
    createdAt: now,
    updatedAt: now,
  };
  await ref.create(org);
  return org;
}

export async function getMember(
  organizationId: string,
  userId: string
): Promise<Member | null> {
  const snap = await firestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("members")
    .doc(userId)
    .get();
  return snap.exists ? MemberSchema.parse(snap.data()) : null;
}

export async function upsertMember(
  organizationId: string,
  userId: string,
  email: string,
  role: Role
): Promise<Member> {
  const now = Date.now();
  const ref = firestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("members")
    .doc(userId);
  const existing = await ref.get();
  if (existing.exists) {
    const member = MemberSchema.parse(existing.data());
    await ref.update({ updatedAt: now });
    return member;
  }
  const member: Member = {
    userId,
    organizationId,
    email,
    role,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await ref.create(member);
  return member;
}

export async function countMembers(organizationId: string): Promise<number> {
  const agg = await firestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("members")
    .count()
    .get();
  return agg.data().count;
}

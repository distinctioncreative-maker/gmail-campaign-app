import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { parseAllowedDomains } from "@/lib/auth/domains";
import {
  MemberSchema,
  OrganizationSchema,
  type Member,
  type Organization,
} from "@/schemas/user";
import type { Role } from "@/schemas/common";

const DEFAULT_ORG_ID = "default";

/** Email domain → organization id. The first allowed domain (the primary
 * tenant, e.g. alpinefundings.com) aliases to the existing DEFAULT_ORG_ID so
 * its admin, members, and settings are preserved. Every other domain gets its
 * own isolated org. Empty allowlist (dev) ⇒ single default org. */
/** Pure resolver (testable): domain + allowlist → org id. */
export function resolveOrgId(domain: string, allowedDomains: string[]): string {
  const d = domain.trim().toLowerCase();
  const primary = allowedDomains[0] ?? null;
  if (!d || primary === null || d === primary) return DEFAULT_ORG_ID;
  return `org_${d.replace(/[^a-z0-9]+/g, "_")}`;
}

export function orgIdForDomain(domain: string): string {
  return resolveOrgId(domain, parseAllowedDomains(env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN));
}

function orgNameForDomain(domain: string, orgId: string): string {
  if (orgId === DEFAULT_ORG_ID) return env.DEFAULT_ORGANIZATION_NAME;
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Resolve (creating if needed) the organization for an email domain. */
export async function getOrCreateOrganizationForDomain(domain: string): Promise<Organization> {
  const db = firestore();
  const orgId = orgIdForDomain(domain);
  const ref = db.collection("organizations").doc(orgId);
  const snap = await ref.get();
  if (snap.exists) return OrganizationSchema.parse(snap.data());

  const now = Date.now();
  const org: Organization = {
    organizationId: orgId,
    name: orgNameForDomain(domain, orgId),
    // New per-domain orgs allow just their own domain; the default org keeps
    // the full allowlist for backward compatibility.
    allowedDomain: orgId === DEFAULT_ORG_ID ? env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN : domain,
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
    teamId: null,
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

import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { parseAllowedDomains } from "@/lib/auth/domains";
import {
  MemberSchema,
  OrganizationSchema,
  type Member,
  type Organization,
  type TenantType,
} from "@/schemas/user";
import type { Role } from "@/schemas/common";
import { tenantTypeFor } from "@/lib/tenancy/accountType";

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
  const now = Date.now();
  const org: Organization = {
    organizationId: orgId,
    name: orgNameForDomain(domain, orgId),
    tenantType: "WORKSPACE",
    // New per-domain orgs allow just their own domain; the default org keeps
    // the full allowlist for backward compatibility.
    allowedDomain: orgId === DEFAULT_ORG_ID ? env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN : domain,
    collisionPolicy: "OFF",
    collisionBlockDays: 30,
    createdAt: now,
    updatedAt: now,
  };
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return OrganizationSchema.parse(snap.data());
    tx.create(ref, org);
    // New public workspaces start on FREE. Existing internal workspaces
    // without billing state keep their grandfathered TEAM default.
    tx.create(ref.collection("organizationSettings").doc("main"), {
      billing: {
        plan: "FREE",
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        seats: 1,
        currentPeriodEnd: null,
        lastStripeEventCreated: 0,
        lastStripeEventPriority: 0,
      },
      updatedAt: now,
    });
    return org;
  });
}

/** Resolve (creating if needed) the private per-user workspace for a Solo
 * (consumer Gmail) account. Keyed by uid so two consumers never collide. */
export async function getOrCreateConsumerOrg(
  userId: string,
  displayName: string
): Promise<Organization> {
  const db = firestore();
  const orgId = `user_${userId}`;
  const ref = db.collection("organizations").doc(orgId);
  const now = Date.now();
  const label = displayName.trim().split(/\s+/)[0] || "My";
  const org: Organization = {
    organizationId: orgId,
    name: `${label}'s workspace`,
    tenantType: "CONSUMER",
    allowedDomain: "personal",
    collisionPolicy: "OFF",
    collisionBlockDays: 30,
    createdAt: now,
    updatedAt: now,
  };
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return OrganizationSchema.parse(snap.data());
    tx.create(ref, org);
    tx.create(ref.collection("organizationSettings").doc("main"), {
      billing: {
        plan: "FREE",
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        seats: 1,
        currentPeriodEnd: null,
        lastStripeEventCreated: 0,
        lastStripeEventPriority: 0,
      },
      updatedAt: now,
    });
    return org;
  });
}

/**
 * The one place that decides which tenant an authenticated identity belongs
 * to. Custom domains map to a shared Workspace org (Enterprise); public
 * providers map to a private per-user workspace (Solo).
 */
export async function resolveTenant(identity: {
  userId: string;
  email: string;
  displayName: string;
}): Promise<{ org: Organization; tenantType: TenantType }> {
  const domain = identity.email.split("@")[1]?.toLowerCase() ?? "";
  const tenantType = tenantTypeFor(domain);
  if (tenantType === "CONSUMER") {
    return { org: await getOrCreateConsumerOrg(identity.userId, identity.displayName), tenantType };
  }
  return { org: await getOrCreateOrganizationForDomain(domain), tenantType };
}

/** Promote a Solo (consumer) workspace into a real team org so the owner can
 * invite teammates. Same org id and data — just unlocks team capabilities.
 * No-op for orgs that are already a WORKSPACE. */
export async function promoteConsumerToWorkspace(organizationId: string): Promise<void> {
  await firestore()
    .collection("organizations")
    .doc(organizationId)
    .set({ tenantType: "WORKSPACE", updatedAt: Date.now() }, { merge: true });
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

/**
 * Create a membership and claim the first-admin role through the organization
 * document as a transaction mutex. This prevents two simultaneous first
 * sign-ins from both becoming administrators.
 */
export async function provisionMember(
  organizationId: string,
  userId: string,
  email: string,
  invitedRole: Role | null = null
): Promise<Member> {
  const db = firestore();
  const orgRef = db.collection("organizations").doc(organizationId);
  const memberRef = orgRef.collection("members").doc(userId);
  // Existing organizations predate the adminClaimed marker. Establish whether
  // one already has members before entering the transaction.
  const existingMember = await orgRef.collection("members").limit(1).get();

  return db.runTransaction(async (tx) => {
    const [orgSnap, memberSnap] = await Promise.all([
      tx.get(orgRef),
      tx.get(memberRef),
    ]);
    if (!orgSnap.exists) throw new Error("Organization not found");
    if (memberSnap.exists) return MemberSchema.parse(memberSnap.data());

    const alreadyClaimed =
      orgSnap.data()?.adminClaimed === true || !existingMember.empty;
    const role: Role =
      invitedRole ?? (alreadyClaimed ? "SALES_REP" : "ADMIN");
    const now = Date.now();
    const member: Member = MemberSchema.parse({
      userId,
      organizationId,
      email,
      role,
      active: true,
      teamId: null,
      createdAt: now,
      updatedAt: now,
    });
    tx.create(memberRef, member);
    if (!alreadyClaimed || orgSnap.data()?.adminClaimed !== true) {
      tx.update(orgRef, {
        adminClaimed: true,
        ...(role === "ADMIN" ? { firstAdminUserId: userId } : {}),
        updatedAt: now,
      });
    }
    return member;
  });
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

/** Rename the workspace (shown in the sidebar and Home). Admin-gated by
 * the calling route. */
export async function renameOrganization(organizationId: string, name: string): Promise<void> {
  await firestore().collection("organizations").doc(organizationId).update({
    name,
    updatedAt: Date.now(),
  });
}

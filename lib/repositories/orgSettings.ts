import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { encryptSecret, decryptSecret } from "@/lib/kms/crypto";
import {
  CustomRoleDefinitionSchema,
  MemberSchema,
  OrganizationSchema,
  WorkspaceProfileSchema,
  type CustomRoleDefinition,
  type Member,
  type Organization,
  type WorkspaceProfile,
} from "@/schemas/user";
import type { Role } from "@/schemas/common";
import { type PlanId, defaultPlanFor, isPlanId } from "@/lib/billing/plans";
import { planOverrideMap } from "@/lib/platform/state";

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export interface OrgBilling {
  plan: PlanId;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  seats: number;
  currentPeriodEnd: number | null;
  /** Stripe event creation time (seconds). Older out-of-order events cannot
   * overwrite newer subscription state. */
  lastStripeEventCreated: number;
  /** Tie-breaker for distinct event types created in the same Stripe second:
   * checkout < subscription update < subscription deletion. */
  lastStripeEventPriority: number;
}

function orgRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId);
}

export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const snap = await orgRef(organizationId).get();
  return snap.exists ? OrganizationSchema.parse(snap.data()) : null;
}

export type TrackingDomainStatus = "NONE" | "PENDING" | "VERIFIED" | "FAILED";

export interface OrgSettings {
  collisionPolicy: Organization["collisionPolicy"];
  collisionBlockDays: number;
  sendConfirmThreshold: number;
  /** Sending mode: TEST (default, safe) or LIVE. Only an admin can set
   * LIVE, and only when no deployment lock is active. */
  sendingMode: "TEST" | "LIVE";
  liveEnabledAt: number | null;
  liveEnabledBy: string | null;
  /** Reusable brand context the AI writer weaves into every email it drafts
   * (offer, benefits, tone, guardrails). Kept for back-compat; equals the
   * first brand profile's content. */
  aiBrandContext: string;
  /** Named brand-memory profiles (e.g. "Alpine", "Everest"). A writer picks
   * which one to use; only admins can edit them. */
  aiBrandProfiles: AiBrandProfile[];
  /** Admin-controlled master switch for all AI writing features. Defaults
   * off: AI stays hidden from users until an admin turns it on. */
  aiEnabled: boolean;
  /** Setup answers used to tailor guidance and safe defaults. They never
   * override provider, plan, or campaign safety limits. */
  workspaceProfile: WorkspaceProfile;
  /** Reusable workspace role names, each mapped to an audited base role. */
  customRoles: CustomRoleDefinition[];
  /** The workspace's own tracking hostname, so rewritten links carry the
   * customer's reputation rather than the platform's shared one. Only used
   * while VERIFIED: see lib/tracking/domain.ts. */
  trackingDomain: { host: string; status: TrackingDomainStatus; verifiedAt: number | null; lastCheckedAt: number | null };
  /** Subscription / plan state. Defaults preserve current behavior: existing
   * workspaces read as the TEAM plan, so nothing is gated until billing
   * assigns a plan. */
  billing: OrgBilling;
}

export interface AiBrandProfile {
  id: string;
  name: string;
  content: string;
}

function normalizeProfile(p: unknown): AiBrandProfile {
  const o = (p ?? {}) as Record<string, unknown>;
  return {
    id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
    name: (typeof o.name === "string" && o.name.trim() ? o.name : "Untitled").slice(0, 80),
    content: (typeof o.content === "string" ? o.content : "").slice(0, 4000),
  };
}

/** The brand content to use for a generation: the named profile if given,
 * otherwise the first profile (or legacy single context). */
export function resolveBrandContext(settings: OrgSettings, profileId?: string | null): string {
  if (profileId) {
    const p = settings.aiBrandProfiles.find((x) => x.id === profileId);
    if (p) return p.content;
  }
  return settings.aiBrandProfiles[0]?.content ?? settings.aiBrandContext ?? "";
}

export async function getOrgSettings(organizationId: string): Promise<OrgSettings> {
  const snap = await orgRef(organizationId).collection("organizationSettings").doc("main").get();
  const data = snap.data() ?? {};
  const org = await getOrganization(organizationId);
  // A platform operator's override wins over whatever the subscription says.
  // Applied here rather than at each call site because this is the one function
  // every plan-dependent decision already goes through: send caps, seat limits,
  // and capability gates all read settings.billing.plan, and an override applied
  // in only some of those places would be a plan that half-exists.
  const overrides = await planOverrideMap();
  const overridden = overrides.get(organizationId);
  const billing = resolveBilling(data.billing, org?.tenantType ?? "WORKSPACE");
  return {
    collisionPolicy: (data.collisionPolicy as Organization["collisionPolicy"]) ?? org?.collisionPolicy ?? "OFF",
    collisionBlockDays: (data.collisionBlockDays as number) ?? org?.collisionBlockDays ?? 30,
    sendConfirmThreshold: (data.sendConfirmThreshold as number) ?? 100,
    sendingMode: data.sendingMode === "LIVE" ? "LIVE" : "TEST",
    liveEnabledAt: (data.liveEnabledAt as number) ?? null,
    liveEnabledBy: (data.liveEnabledBy as string) ?? null,
    aiEnabled: data.aiEnabled === true,
    workspaceProfile: WorkspaceProfileSchema.parse(data.workspaceProfile ?? {}),
    customRoles: Array.isArray(data.customRoles)
      ? data.customRoles
          .map((row) => CustomRoleDefinitionSchema.safeParse(row))
          .filter((row) => row.success)
          .map((row) => row.data)
          .slice(0, 20)
      : [],
    billing: overridden && isPlanId(overridden) ? { ...billing, plan: overridden } : billing,
    trackingDomain: resolveTrackingDomain(data.trackingDomain),
    ...resolveBrandFields(data),
  };
}

/**
 * The tracking domain as stored, or the "not configured" default.
 *
 * Every workspace predating this feature has no such field, and reading it as
 * undefined would put "undefined" in a settings card and, worse, let a
 * truthiness check treat an unconfigured domain as usable.
 */
function resolveTrackingDomain(raw: unknown): OrgSettings["trackingDomain"] {
  const row = (raw ?? {}) as Partial<OrgSettings["trackingDomain"]>;
  const host = typeof row.host === "string" ? row.host : "";
  const status =
    row.status === "PENDING" || row.status === "VERIFIED" || row.status === "FAILED"
      ? row.status
      : "NONE";
  return {
    // A status without a host is meaningless and would render as a verified
    // empty string, so the two are reconciled here rather than downstream.
    host,
    status: host ? status : "NONE",
    verifiedAt: Number.isFinite(Number(row.verifiedAt)) ? Number(row.verifiedAt) : null,
    lastCheckedAt: Number.isFinite(Number(row.lastCheckedAt)) ? Number(row.lastCheckedAt) : null,
  };
}

/** Write the tracking domain. Status transitions are decided by the caller. */
export async function saveTrackingDomain(
  organizationId: string,
  patch: OrgSettings["trackingDomain"]
): Promise<void> {
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ trackingDomain: patch, updatedAt: Date.now() }, { merge: true });
  // So a customer who just verified does not have to wait out the TTL before
  // their own links start passing the host cross-check.
  invalidateVerifiedTrackingDomains();
}

/**
 * Every workspace with a verified tracking domain.
 *
 * Cached in memory for the life of the instance, with a short TTL. This is read
 * by the open pixel and the click redirect, which are the highest-volume
 * endpoints in the product and are hit by mail clients rather than by people: a
 * collection-group query per pixel load would be the most expensive query in the
 * system and would scale with recipients rather than with customers.
 *
 * A stale entry is cheap in both directions. The list only decides whether a
 * Host header agrees with a token's organization, and both a newly verified
 * domain arriving a minute late and a removed one lingering a minute merely
 * skip or allow a cross-check that is defence in depth, never the thing that
 * authorises the request. The token signature does that.
 *
 * Needs a COLLECTION_GROUP single-field index on trackingDomain.status:
 * Firestore auto-creates single-field indexes with collection scope only. See
 * firestore.indexes.json.
 */
const verifiedDomainCache: { rows: { organizationId: string; host: string; status: "VERIFIED" }[]; at: number } = {
  rows: [],
  at: 0,
};
const VERIFIED_DOMAIN_TTL_MS = 60_000;

export async function listVerifiedTrackingDomains(): Promise<
  { organizationId: string; host: string; status: "VERIFIED" }[]
> {
  if (Date.now() - verifiedDomainCache.at < VERIFIED_DOMAIN_TTL_MS) {
    return verifiedDomainCache.rows;
  }
  const rows = await queryVerifiedTrackingDomains();
  verifiedDomainCache.rows = rows;
  verifiedDomainCache.at = Date.now();
  return rows;
}

/** Bypasses the cache. For the write path, which must see its own change. */
export function invalidateVerifiedTrackingDomains(): void {
  verifiedDomainCache.at = 0;
}

async function queryVerifiedTrackingDomains(): Promise<
  { organizationId: string; host: string; status: "VERIFIED" }[]
> {
  const snap = await firestore()
    .collectionGroup("organizationSettings")
    .where("trackingDomain.status", "==", "VERIFIED")
    .limit(500)
    .get();
  return snap.docs
    .map((doc) => {
      const host = String((doc.data().trackingDomain as { host?: string } | undefined)?.host ?? "");
      // The organization id is the settings document's grandparent.
      const organizationId = doc.ref.parent.parent?.id ?? "";
      return { organizationId, host, status: "VERIFIED" as const };
    })
    .filter((row) => row.host !== "" && row.organizationId !== "");
}

export async function saveWorkspaceProfile(
  organizationId: string,
  profile: WorkspaceProfile
): Promise<void> {
  const parsed = WorkspaceProfileSchema.parse(profile);
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ workspaceProfile: parsed, updatedAt: Date.now() }, { merge: true });
}

export async function saveCustomRoles(
  organizationId: string,
  roles: CustomRoleDefinition[]
): Promise<CustomRoleDefinition[]> {
  const normalized = roles.slice(0, 20).map((role) => CustomRoleDefinitionSchema.parse(role));
  const names = new Set<string>();
  for (const role of normalized) {
    const key = role.name.toLocaleLowerCase();
    if (names.has(key)) throw new Error("Custom role names must be unique");
    names.add(key);
  }
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ customRoles: normalized, updatedAt: Date.now() }, { merge: true });
  return normalized;
}

/** Read stored billing state, defaulting to the tenant's baseline plan so
 * un-subscribed orgs keep full (grandfathered) behavior. */
function resolveBilling(raw: unknown, tenantType: "WORKSPACE" | "CONSUMER"): OrgBilling {
  const b = (raw ?? {}) as Record<string, unknown>;
  return {
    plan: isPlanId(b.plan) ? b.plan : defaultPlanFor(tenantType),
    status: (["trialing", "active", "past_due", "canceled"].includes(b.status as string)
      ? b.status
      : "none") as SubscriptionStatus,
    stripeCustomerId: typeof b.stripeCustomerId === "string" ? b.stripeCustomerId : null,
    stripeSubscriptionId: typeof b.stripeSubscriptionId === "string" ? b.stripeSubscriptionId : null,
    seats: typeof b.seats === "number" ? b.seats : 0,
    currentPeriodEnd: typeof b.currentPeriodEnd === "number" ? b.currentPeriodEnd : null,
    lastStripeEventCreated:
      typeof b.lastStripeEventCreated === "number" ? b.lastStripeEventCreated : 0,
    lastStripeEventPriority:
      typeof b.lastStripeEventPriority === "number" ? b.lastStripeEventPriority : 0,
  };
}

/** Persist billing state (server-only; callers are the Stripe layer). Firestore
 * deep-merges the billing map, so a partial patch updates only those fields. */
export async function saveBilling(organizationId: string, patch: Partial<OrgBilling>): Promise<void> {
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ billing: patch, updatedAt: Date.now() }, { merge: true });
}

/** Apply Stripe-originated billing state only when the event is at least as
 * new as the last one already committed for this organization. */
export async function saveBillingFromStripe(
  organizationId: string,
  eventCreated: number,
  patch: Partial<OrgBilling>,
  eventPriority = 0
): Promise<boolean> {
  const ref = orgRef(organizationId).collection("organizationSettings").doc("main");
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const billing = (snap.data()?.billing ?? {}) as Record<string, unknown>;
    const last =
      typeof billing.lastStripeEventCreated === "number"
        ? billing.lastStripeEventCreated
        : 0;
    const lastPriority =
      typeof billing.lastStripeEventPriority === "number"
        ? billing.lastStripeEventPriority
        : 0;
    if (
      eventCreated < last ||
      (eventCreated === last && eventPriority < lastPriority)
    ) {
      return false;
    }
    tx.set(
      ref,
      {
        billing: {
          ...patch,
          lastStripeEventCreated: eventCreated,
          lastStripeEventPriority: eventPriority,
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    return true;
  });
}

/** Turn all AI writing features on or off for the org (admin only: the
 * caller enforces the role). */
export async function setAiEnabled(organizationId: string, enabled: boolean): Promise<void> {
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ aiEnabled: enabled, updatedAt: Date.now() }, { merge: true });
}

/** Read brand profiles, migrating the legacy single aiBrandContext into a
 * "Default" profile when no profiles exist yet. */
function resolveBrandFields(data: Record<string, unknown>): {
  aiBrandContext: string;
  aiBrandProfiles: AiBrandProfile[];
} {
  const raw = Array.isArray(data.aiBrandProfiles) ? data.aiBrandProfiles : [];
  const legacy = typeof data.aiBrandContext === "string" ? data.aiBrandContext : "";
  const aiBrandProfiles =
    raw.length > 0
      ? raw.map(normalizeProfile)
      : legacy.trim()
        ? [{ id: "default", name: "Default", content: legacy }]
        : [];
  return { aiBrandProfiles, aiBrandContext: aiBrandProfiles[0]?.content ?? legacy };
}

/** Replace the org's brand-memory profiles (admin only: caller enforces).
 * Also mirrors the first profile into aiBrandContext for back-compat. */
export async function saveBrandProfiles(
  organizationId: string,
  profiles: AiBrandProfile[]
): Promise<AiBrandProfile[]> {
  const normalized = profiles.slice(0, 12).map(normalizeProfile);
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set(
      {
        aiBrandProfiles: normalized,
        aiBrandContext: normalized[0]?.content ?? "",
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  return normalized;
}

export async function updateOrgSettings(
  organizationId: string,
  patch: Partial<
    Pick<
      OrgSettings,
      "collisionPolicy" | "collisionBlockDays" | "sendConfirmThreshold" | "aiBrandContext"
    >
  >
): Promise<void> {
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set({ ...patch, updatedAt: Date.now() }, { merge: true });
}

/** Flip the whole organization between TEST and LIVE sending. Callers must
 * verify the actor is an admin and that no env lock is active. */
export async function setSendingMode(
  organizationId: string,
  mode: "TEST" | "LIVE",
  actorUserId: string
): Promise<void> {
  const now = Date.now();
  await orgRef(organizationId)
    .collection("organizationSettings")
    .doc("main")
    .set(
      {
        sendingMode: mode,
        liveEnabledAt: mode === "LIVE" ? now : null,
        liveEnabledBy: mode === "LIVE" ? actorUserId : null,
        updatedAt: now,
      },
      { merge: true }
    );
  // Audit trail for this high-impact action.
  await orgRef(organizationId).collection("organizationSettings").doc("main")
    .collection("modeChanges").add({
      mode,
      actorUserId,
      at: now,
    });
}

/**
 * Return the org-specific HMAC secret used to hash normalized emails for
 * privacy-preserving collision detection (spec §4). Generated once and
 * stored KMS-encrypted; never a plain email hash.
 */
export async function getCollisionSecret(organizationId: string): Promise<string> {
  const ref = orgRef(organizationId).collection("organizationSettings").doc("collisionSecret");
  const snap = await ref.get();
  const existing = snap.data()?.encrypted as string | undefined;
  if (existing) return decryptSecret(existing);

  const secret = crypto.randomBytes(32).toString("hex");
  await ref.set({ encrypted: await encryptSecret(secret), createdAt: Date.now() });
  return secret;
}

// ── Membership / roles ───────────────────────────────────────────

export async function listMembers(organizationId: string): Promise<Member[]> {
  const snap = await orgRef(organizationId).collection("members").limit(500).get();
  return snap.docs.map((d) => MemberSchema.parse(d.data()));
}

export async function setMemberAccess(
  organizationId: string,
  userId: string,
  role: Role,
  customRole: CustomRoleDefinition | null = null
): Promise<void> {
  const now = Date.now();
  const memberRef = orgRef(organizationId).collection("members").doc(userId);
  const userRef = firestore().collection("users").doc(userId);
  await firestore().runTransaction(async (tx) => {
    const [memberSnap, userSnap] = await Promise.all([
      tx.get(memberRef),
      tx.get(userRef),
    ]);
    if (!memberSnap.exists || !userSnap.exists) {
      throw new Error("Member or user record not found");
    }
    tx.update(memberRef, {
      role,
      customRoleId: customRole?.id ?? null,
      roleLabel: customRole?.name ?? null,
      updatedAt: now,
    });
    tx.update(userRef, {
      role,
      roleLabel: customRole?.name ?? null,
      updatedAt: now,
    });
  });
}

/** Backward-compatible built-in role update. */
export async function setMemberRole(
  organizationId: string,
  userId: string,
  role: Role
): Promise<void> {
  await setMemberAccess(organizationId, userId, role, null);
}

/** Keep denormalized labels current when an administrator renames a role. */
export async function refreshCustomRoleAssignments(
  organizationId: string,
  role: CustomRoleDefinition
): Promise<void> {
  const members = await orgRef(organizationId)
    .collection("members")
    .where("customRoleId", "==", role.id)
    .get();
  const now = Date.now();
  for (let offset = 0; offset < members.docs.length; offset += 200) {
    const batch = firestore().batch();
    for (const member of members.docs.slice(offset, offset + 200)) {
      batch.update(member.ref, {
        role: role.baseRole,
        roleLabel: role.name,
        updatedAt: now,
      });
      batch.update(firestore().collection("users").doc(member.id), {
        role: role.baseRole,
        roleLabel: role.name,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
}

export async function setMemberActive(
  organizationId: string,
  userId: string,
  active: boolean,
  maxActiveMembers: number | null = null
): Promise<"UPDATED" | "NOT_FOUND" | "SEAT_LIMIT"> {
  const now = Date.now();
  const memberRef = orgRef(organizationId).collection("members").doc(userId);
  const userRef = firestore().collection("users").doc(userId);
  return firestore().runTransaction(async (tx) => {
    const [memberSnap, userSnap] = await Promise.all([
      tx.get(memberRef),
      tx.get(userRef),
    ]);
    if (!memberSnap.exists || !userSnap.exists) return "NOT_FOUND";
    if (memberSnap.data()?.active === active && userSnap.data()?.active === active) {
      return "UPDATED";
    }
    if (active && maxActiveMembers !== null) {
      const activeSnap = await tx.get(
        orgRef(organizationId)
          .collection("members")
          .where("active", "==", true)
          .limit(maxActiveMembers)
      );
      if (activeSnap.size >= maxActiveMembers) return "SEAT_LIMIT";
    }
    tx.update(memberRef, { active, updatedAt: now });
    tx.update(userRef, { active, updatedAt: now });
    return "UPDATED";
  });
}

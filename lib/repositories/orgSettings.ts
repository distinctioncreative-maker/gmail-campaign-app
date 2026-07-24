import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { encryptSecret, decryptSecret } from "@/lib/kms/crypto";
import { MemberSchema, OrganizationSchema, type Member, type Organization } from "@/schemas/user";
import type { Role } from "@/schemas/common";

function orgRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId);
}

export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const snap = await orgRef(organizationId).get();
  return snap.exists ? OrganizationSchema.parse(snap.data()) : null;
}

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
  return {
    collisionPolicy: (data.collisionPolicy as Organization["collisionPolicy"]) ?? org?.collisionPolicy ?? "OFF",
    collisionBlockDays: (data.collisionBlockDays as number) ?? org?.collisionBlockDays ?? 30,
    sendConfirmThreshold: (data.sendConfirmThreshold as number) ?? 100,
    sendingMode: data.sendingMode === "LIVE" ? "LIVE" : "TEST",
    liveEnabledAt: (data.liveEnabledAt as number) ?? null,
    liveEnabledBy: (data.liveEnabledBy as string) ?? null,
    ...resolveBrandFields(data),
  };
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

/** Replace the org's brand-memory profiles (admin only — caller enforces).
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

export async function setMemberRole(
  organizationId: string,
  userId: string,
  role: Role
): Promise<void> {
  const now = Date.now();
  await orgRef(organizationId).collection("members").doc(userId).update({ role, updatedAt: now });
  await firestore().collection("users").doc(userId).update({ role, updatedAt: now });
}

export async function setMemberActive(
  organizationId: string,
  userId: string,
  active: boolean
): Promise<void> {
  const now = Date.now();
  await orgRef(organizationId).collection("members").doc(userId).update({ active, updatedAt: now });
  await firestore().collection("users").doc(userId).update({ active, updatedAt: now });
}

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
  };
}

export async function updateOrgSettings(
  organizationId: string,
  patch: Partial<Pick<OrgSettings, "collisionPolicy" | "collisionBlockDays" | "sendConfirmThreshold">>
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

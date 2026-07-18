import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { getCollisionSecret, getOrgSettings } from "@/lib/repositories/orgSettings";

/**
 * Privacy-preserving cross-user collision detection (spec §4). Emails are
 * stored only as HMAC-SHA256 digests keyed by an org secret — never as
 * plain or unsalted hashes, and never with recipient identity exposed to
 * other sales reps.
 */

function hashesRef(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId).collection("teamCollisionHashes");
}

export async function computeCollisionHash(
  organizationId: string,
  normalizedEmail: string
): Promise<string> {
  const secret = await getCollisionSecret(organizationId);
  return crypto.createHmac("sha256", secret).update(normalizedEmail).digest("hex");
}

/** Record that this org contacted an email (called on every send). */
export async function recordCollisionContact(
  organizationId: string,
  userId: string,
  normalizedEmail: string
): Promise<void> {
  const settings = await getOrgSettings(organizationId);
  if (settings.collisionPolicy === "OFF") return;
  const hash = await computeCollisionHash(organizationId, normalizedEmail);
  await hashesRef(organizationId).doc(hash).set(
    {
      lastUserId: userId,
      lastContactedAt: Date.now(),
    },
    { merge: true }
  );
}

export interface CollisionResult {
  collision: boolean;
  block: boolean;
  /** Only populated for MANAGER_VISIBLE policy + manager viewer. */
  lastUserId: string | null;
  lastContactedAt: number | null;
}

/**
 * Check whether another rep in the org has recently contacted this email.
 * Reps see only a boolean; managers may see who/when when the policy allows.
 */
export async function checkCollision(
  organizationId: string,
  currentUserId: string,
  normalizedEmail: string,
  viewerIsManager: boolean
): Promise<CollisionResult> {
  const settings = await getOrgSettings(organizationId);
  const none: CollisionResult = { collision: false, block: false, lastUserId: null, lastContactedAt: null };
  if (settings.collisionPolicy === "OFF") return none;

  const hash = await computeCollisionHash(organizationId, normalizedEmail);
  const snap = await hashesRef(organizationId).doc(hash).get();
  if (!snap.exists) return none;

  const data = snap.data()!;
  const lastUserId = data.lastUserId as string | undefined;
  const lastContactedAt = data.lastContactedAt as number | undefined;
  if (!lastUserId || lastUserId === currentUserId) return none;

  const withinBlockWindow =
    lastContactedAt !== undefined &&
    Date.now() - lastContactedAt < settings.collisionBlockDays * 24 * 60 * 60 * 1000;

  const reveal = settings.collisionPolicy === "MANAGER_VISIBLE" && viewerIsManager;

  return {
    collision: true,
    block: settings.collisionPolicy === "BLOCK_RECENT_TEAM_CONTACT" && withinBlockWindow,
    lastUserId: reveal ? lastUserId : null,
    lastContactedAt: reveal ? lastContactedAt ?? null : null,
  };
}

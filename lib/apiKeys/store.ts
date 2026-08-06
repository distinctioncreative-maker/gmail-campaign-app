import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { ApiKeySchema, type ApiKey, type ApiKeyPublic } from "@/schemas/integration";
import {
  generateApiKey,
  hashApiKey,
  hashesMatch,
  looksLikeApiKey,
  type ApiScope,
  type KeyEnvironment,
} from "./token";

/**
 * Storing and verifying API keys.
 *
 * Keys live in a top-level collection rather than under the organization,
 * because verification starts from the key and has to find the workspace, not
 * the other way round. A per-org subcollection would force a collection-group
 * query on every authenticated API request.
 *
 * The document id *is* the hash. That is what makes verification a single point
 * read rather than a query: no scanning candidates, no comparing hashes in a
 * loop, and no opportunity for the number of comparisons to depend on how much
 * of a guessed key was right.
 */

const keysRef = () => firestore().collection("apiKeys");

export async function createApiKey(input: {
  organizationId: string;
  createdByUserId: string;
  /** Whose data the key addresses. See schemas/integration.ts. */
  ownerUserId: string;
  name: string;
  scopes: ApiScope[];
  environment?: KeyEnvironment;
}): Promise<{ key: ApiKeyPublic; secret: string }> {
  const generated = generateApiKey(input.environment ?? "live");
  const now = Date.now();
  const record: ApiKey = ApiKeySchema.parse({
    keyId: crypto.randomUUID(),
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    ownerUserId: input.ownerUserId,
    name: input.name,
    hash: generated.hash,
    display: generated.display,
    environment: generated.environment,
    scopes: input.scopes,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await keysRef().doc(generated.hash).set(record);
  const { hash: _omit, ...safe } = record;
  // The only moment the secret exists outside the caller's request.
  return { key: safe, secret: generated.secret };
}

export async function listApiKeys(organizationId: string): Promise<ApiKeyPublic[]> {
  const snap = await keysRef().where("organizationId", "==", organizationId).limit(100).get();
  return snap.docs
    .map((doc) => {
      const { hash: _omit, ...safe } = ApiKeySchema.parse(doc.data());
      return safe;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeApiKey(organizationId: string, keyId: string): Promise<boolean> {
  const snap = await keysRef()
    .where("organizationId", "==", organizationId)
    .where("keyId", "==", keyId)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return false;
  await doc.ref.update({ revokedAt: Date.now(), updatedAt: Date.now() });
  return true;
}

export interface ApiKeyContext {
  organizationId: string;
  /** The owner scope for every read and write this key performs. */
  ownerUserId: string;
  keyId: string;
  scopes: readonly string[];
  environment: KeyEnvironment;
}

/**
 * Resolve a presented secret to a workspace, or null.
 *
 * Shape-checked before any read, so a malformed header costs nothing. The
 * stored hash is compared against the recomputed one in constant time even
 * though the document was found by that same hash: the point-read makes the
 * comparison redundant in practice, and it costs nothing to keep the invariant
 * explicit rather than resting on an implementation detail of the lookup.
 */
export async function verifyApiKey(secret: string): Promise<ApiKeyContext | null> {
  if (!looksLikeApiKey(secret)) return null;
  const hash = hashApiKey(secret);
  const snap = await keysRef().doc(hash).get();
  if (!snap.exists) return null;

  const key = ApiKeySchema.parse(snap.data());
  if (!hashesMatch(key.hash, hash)) return null;
  if (key.revokedAt !== null) return null;

  // Fire and forget: last-used is useful for spotting a key nobody uses, and
  // is never worth adding a blocking write to an API request for.
  void snap.ref
    .update({ lastUsedAt: Date.now() })
    .catch(() => {
      /* Telemetry, not correctness. */
    });

  return {
    organizationId: key.organizationId,
    ownerUserId: key.ownerUserId,
    keyId: key.keyId,
    scopes: key.scopes,
    environment: key.environment,
  };
}

/** Remove every key for an organization. Called by the deletion purge. */
export async function purgeApiKeys(organizationId: string): Promise<void> {
  const snap = await keysRef().where("organizationId", "==", organizationId).limit(500).get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
}

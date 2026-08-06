import "server-only";
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import {
  GmailConnectionSchema,
  type GmailConnection,
  type GmailConnectionPublic,
} from "@/schemas/gmailConnection";

/**
 * Gmail connections: one to many per user.
 *
 * This used to be exactly one connection at a fixed document id, `primary`.
 * That id is kept for the existing document rather than migrated, so every
 * account that connected an inbox before rotation existed keeps its connection,
 * its token, and its warmup history, and simply becomes an account with one
 * connection in a collection that now allows several.
 *
 * The one thing a plain read cannot get right is the `primary` flag. It did not
 * exist when those documents were written, so Zod fills it with `false` on
 * parse, and a pool where nothing is primary has no defined fallback inbox.
 * `withResolvedPrimary` repairs that on read instead of leaving a migration to
 * remember: the document literally called `primary` is the primary one. It
 * lives in lib/sending/inboxPool.ts so the rule stays testable without
 * Firestore in the way.
 */

import { withResolvedPrimary, LEGACY_PRIMARY_ID } from "@/lib/sending/inboxPool";

function connectionsRef(userId: string) {
  return firestore().collection("users").doc(userId).collection("gmailConnections");
}

function connectionRef(userId: string, connectionId: string) {
  return connectionsRef(userId).doc(connectionId);
}

/** Every inbox this user has connected, oldest first. */
export async function listConnections(userId: string): Promise<GmailConnection[]> {
  const snap = await connectionsRef(userId).get();
  const parsed = snap.docs.map((doc) =>
    GmailConnectionSchema.parse({ ...doc.data(), connectionId: doc.id })
  );
  return withResolvedPrimary(parsed).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listConnectionsPublic(userId: string): Promise<GmailConnectionPublic[]> {
  return (await listConnections(userId)).map(({ encryptedRefreshToken: _omit, ...rest }) => rest);
}

/**
 * The user's default inbox.
 *
 * Kept with its original name and single-connection behaviour, because a great
 * deal of the product legitimately wants "this user's inbox": the reply
 * scanner, the deliverability page, the setup test. Only the send path needs to
 * choose between inboxes.
 */
export async function getConnection(userId: string): Promise<GmailConnection | null> {
  const all = await listConnections(userId);
  if (all.length === 0) return null;
  // A connected primary, else any connected inbox, else the primary so callers
  // can report the real reason rather than "not connected".
  return (
    all.find((c) => c.primary && c.status === "CONNECTED") ??
    all.find((c) => c.status === "CONNECTED") ??
    all.find((c) => c.primary) ??
    all[0]
  );
}

export async function getConnectionById(
  userId: string,
  connectionId: string
): Promise<GmailConnection | null> {
  const snap = await connectionRef(userId, connectionId).get();
  if (!snap.exists) return null;
  return GmailConnectionSchema.parse({ ...snap.data(), connectionId: snap.id });
}

export async function getConnectionPublic(
  userId: string
): Promise<GmailConnectionPublic | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;
  const { encryptedRefreshToken: _omit, ...rest } = conn;
  return rest;
}

/**
 * Save a connection, keyed by the address it authorizes.
 *
 * Keyed by address rather than by a fresh id on purpose. Reconnecting the same
 * mailbox has to update the existing connection, not add a second one: the
 * alternative is a customer who reconnects after an expiry ending up with two
 * entries for one inbox, half their sending history on the dead one, and a
 * warmup ramp that restarts.
 *
 * The legacy `primary` document is matched first, so an account's original
 * inbox is updated in place and never duplicated on reconnect.
 */
export async function saveConnection(input: {
  userId: string;
  connectedEmail: string;
  encryptedRefreshToken: string;
  grantedScopes: string[];
  label?: string;
}): Promise<GmailConnection> {
  const now = Date.now();
  const existingAll = await listConnections(input.userId);
  const normalizedEmail = input.connectedEmail.trim().toLowerCase();
  const existing =
    existingAll.find((c) => c.connectedEmail.toLowerCase() === normalizedEmail) ?? null;

  const connectionId = existing?.connectionId ?? deriveConnectionId(normalizedEmail, existingAll);
  const isFirst = existingAll.length === 0;

  const connection: GmailConnection = {
    connectionId,
    userId: input.userId,
    connectedEmail: input.connectedEmail,
    encryptedRefreshToken: input.encryptedRefreshToken,
    grantedScopes: input.grantedScopes,
    status: "CONNECTED",
    lastRefreshAt: now,
    lastSuccessfulApiCallAt: existing?.lastSuccessfulApiCallAt ?? null,
    revokedAt: null,
    tokenVersion: (existing?.tokenVersion ?? 0) + 1,
    label: input.label ?? existing?.label ?? "",
    // First inbox is primary. A reconnect keeps whatever it was, and a second
    // inbox never steals the flag from the one already sending.
    primary: existing?.primary ?? isFirst,
    // Reconnecting must not reset the ramp: this inbox has the history it has.
    lifetimeSends: existing?.lifetimeSends ?? 0,
    sentCount: existing?.sentCount ?? 0,
    bounceCount: existing?.bounceCount ?? 0,
    dailyLimit: existing?.dailyLimit ?? null,
    // Reconnecting an inbox is an act of turning it back on.
    paused: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await connectionRef(input.userId, connectionId).set(connection);
  return connection;
}

/** First inbox keeps the historic id so nothing has to migrate. */
function deriveConnectionId(normalizedEmail: string, existing: GmailConnection[]): string {
  if (existing.length === 0) return LEGACY_PRIMARY_ID;
  // Hashed address rather than a random id, so a reconnect after the document
  // was somehow removed lands on the same id instead of accumulating entries.
  return `c-${crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 20)}`;
}

export async function markDisconnected(userId: string, connectionId?: string): Promise<void> {
  const target = connectionId ?? (await getConnection(userId))?.connectionId;
  if (!target) return;
  const now = Date.now();
  await connectionRef(userId, target).set(
    {
      status: "REVOKED",
      encryptedRefreshToken: "revoked",
      revokedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  await ensurePrimaryExists(userId);
}

export async function markNeedsReconnect(userId: string, connectionId?: string): Promise<void> {
  const target = connectionId ?? (await getConnection(userId))?.connectionId;
  if (!target) return;
  await connectionRef(userId, target).set(
    { status: "NEEDS_RECONNECT", updatedAt: Date.now() },
    { merge: true }
  );
}

export async function recordSuccessfulApiCall(
  userId: string,
  connectionId?: string
): Promise<void> {
  const target = connectionId ?? (await getConnection(userId))?.connectionId;
  if (!target) return;
  await connectionRef(userId, target).set(
    { lastSuccessfulApiCallAt: Date.now(), updatedAt: Date.now() },
    { merge: true }
  );
}

/**
 * Attribute one real send to an inbox.
 *
 * Increments rather than writes, so two workers sending concurrently from the
 * same inbox cannot lose a count between a read and a write. `lifetimeSends`
 * feeds the warmup ramp and `sentCount` feeds the per-inbox brake, and an
 * undercounted brake is a brake that fails to engage.
 */
export async function recordInboxSend(userId: string, connectionId: string): Promise<void> {
  await connectionRef(userId, connectionId).set(
    {
      lifetimeSends: FieldValue.increment(1),
      sentCount: FieldValue.increment(1),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/** Attribute a bounce to the inbox that sent the message. */
export async function recordInboxBounce(userId: string, connectionId: string): Promise<void> {
  await connectionRef(userId, connectionId).set(
    { bounceCount: FieldValue.increment(1), updatedAt: Date.now() },
    { merge: true }
  );
}

export async function updateConnectionSettings(
  userId: string,
  connectionId: string,
  patch: { label?: string; dailyLimit?: number | null; paused?: boolean }
): Promise<void> {
  const clean: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.label !== undefined) clean.label = patch.label.slice(0, 60);
  if (patch.dailyLimit !== undefined) {
    clean.dailyLimit =
      patch.dailyLimit === null ? null : Math.max(1, Math.round(patch.dailyLimit));
  }
  if (patch.paused !== undefined) clean.paused = patch.paused;
  await connectionRef(userId, connectionId).set(clean, { merge: true });
}

/**
 * Move the primary flag.
 *
 * A transaction because primary is an exactly-one invariant across documents,
 * and two concurrent requests each clearing and setting could otherwise leave
 * zero or two.
 */
export async function setPrimaryConnection(userId: string, connectionId: string): Promise<void> {
  const all = await listConnections(userId);
  if (!all.some((c) => c.connectionId === connectionId)) return;
  const batch = firestore().batch();
  for (const connection of all) {
    batch.set(
      connectionRef(userId, connection.connectionId),
      { primary: connection.connectionId === connectionId, updatedAt: Date.now() },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * Remove an inbox entirely.
 *
 * Refuses to remove the last one: an account with no connection cannot send,
 * and "delete" reading as "break my workspace" is not a reasonable outcome of
 * tidying up a list. Disconnecting is the way to stop using the only inbox.
 */
export async function deleteConnection(
  userId: string,
  connectionId: string
): Promise<{ deleted: boolean; reason?: string }> {
  const all = await listConnections(userId);
  if (all.length <= 1) {
    return {
      deleted: false,
      reason: "This is your only inbox. Disconnect it instead if you want to stop sending.",
    };
  }
  await connectionRef(userId, connectionId).delete();
  await ensurePrimaryExists(userId);
  return { deleted: true };
}

/** After a removal or revocation, make sure some inbox is still the default. */
async function ensurePrimaryExists(userId: string): Promise<void> {
  const all = await listConnections(userId);
  if (all.length === 0) return;
  const stored = all.find((c) => c.primary);
  const preferred =
    all.find((c) => c.status === "CONNECTED" && !c.paused) ?? all.find((c) => c.status === "CONNECTED");
  // Only move the flag when the current holder cannot send: churning it on
  // every revocation would keep changing which address a campaign defaults to.
  if (preferred && (!stored || stored.status !== "CONNECTED")) {
    await setPrimaryConnection(userId, preferred.connectionId);
  }
}

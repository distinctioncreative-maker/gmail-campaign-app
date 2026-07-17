import "server-only";
import { firestore } from "@/lib/firebase/admin";
import {
  GmailConnectionSchema,
  type GmailConnection,
  type GmailConnectionPublic,
} from "@/schemas/gmailConnection";

/** One active connection per user, stored at a fixed doc ID. */
const CONNECTION_DOC = "primary";

function connectionRef(userId: string) {
  return firestore()
    .collection("users")
    .doc(userId)
    .collection("gmailConnections")
    .doc(CONNECTION_DOC);
}

export async function getConnection(userId: string): Promise<GmailConnection | null> {
  const snap = await connectionRef(userId).get();
  return snap.exists ? GmailConnectionSchema.parse(snap.data()) : null;
}

export async function getConnectionPublic(
  userId: string
): Promise<GmailConnectionPublic | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;
  const { encryptedRefreshToken: _omit, ...rest } = conn;
  return rest;
}

export async function saveConnection(input: {
  userId: string;
  connectedEmail: string;
  encryptedRefreshToken: string;
  grantedScopes: string[];
}): Promise<void> {
  const now = Date.now();
  const existing = await getConnection(input.userId);
  const connection: GmailConnection = {
    connectionId: CONNECTION_DOC,
    userId: input.userId,
    connectedEmail: input.connectedEmail,
    encryptedRefreshToken: input.encryptedRefreshToken,
    grantedScopes: input.grantedScopes,
    status: "CONNECTED",
    lastRefreshAt: now,
    lastSuccessfulApiCallAt: null,
    revokedAt: null,
    tokenVersion: (existing?.tokenVersion ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await connectionRef(input.userId).set(connection);
}

export async function markDisconnected(userId: string): Promise<void> {
  const now = Date.now();
  await connectionRef(userId).set(
    {
      status: "REVOKED",
      encryptedRefreshToken: "revoked",
      revokedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function markNeedsReconnect(userId: string): Promise<void> {
  await connectionRef(userId).set(
    { status: "NEEDS_RECONNECT", updatedAt: Date.now() },
    { merge: true }
  );
}

export async function recordSuccessfulApiCall(userId: string): Promise<void> {
  await connectionRef(userId).set(
    { lastSuccessfulApiCallAt: Date.now(), updatedAt: Date.now() },
    { merge: true }
  );
}

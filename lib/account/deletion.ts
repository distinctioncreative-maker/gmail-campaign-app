import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { AuthContext } from "@/lib/auth/requireUser";
import { listMembers } from "@/lib/repositories/orgSettings";
import { getConnection, markDisconnected } from "@/lib/repositories/gmailConnections";
import { decryptSecret } from "@/lib/kms/crypto";
import { oauthClient } from "@/lib/google/oauth";
import { redactErrorMessage } from "@/lib/observability/report";
import { purgeApiKeys } from "@/lib/apiKeys/store";
import { revokeAllSessionsQuietly } from "@/lib/auth/sessions";
import {
  DeletedIdentitySchema,
  DeletionRequestSchema,
  type DeletedIdentity,
  type DeletionRequest,
} from "@/schemas/deletion";
import {
  assessDeletion,
  isDue,
  purgeDueAt,
  type DeletionScope,
  type DeletionVerdict,
} from "./eligibility";

/**
 * Account and workspace deletion.
 *
 * Soft first, hard later. A request marks an intent and starts a thirty-day
 * clock; nothing is destroyed until it elapses. The account keeps working
 * throughout, because a grace period the customer cannot act during is just a
 * delay, and the whole point is that they can change their mind.
 *
 * The hard purge is deliberately not a single recursiveDelete. Two things live
 * outside Firestore and would survive it silently:
 *
 * - The Google OAuth grant. Deleting the encrypted refresh token removes our
 *   copy but leaves Cadence listed in the customer's Google account with
 *   access to their mailbox. Revoking with Google is the part that actually
 *   ends the relationship, so it runs first and its outcome is recorded.
 * - The Firebase Auth identity. It is not ours to delete, and it is the reason
 *   a tombstone exists: without one, the next sign-in provisions a brand-new
 *   user document and the deletion silently undoes itself.
 */

const requestsRef = () => firestore().collection("deletionRequests");
const tombstonesRef = () => firestore().collection("deletedIdentities");

export interface DeletionState {
  request: DeletionRequest | null;
  verdict: DeletionVerdict;
}

/** Members are counted from the org, never from the client. */
async function subjectFor(ctx: AuthContext) {
  const members = await listMembers(ctx.organizationId);
  const active = members.filter((m) => m.active);
  return {
    role: ctx.role as "ADMIN" | "MANAGER" | "SALES_REP",
    tenantType: ctx.tenantType,
    memberCount: active.length,
    adminCount: active.filter((m) => m.role === "ADMIN").length,
  };
}

/** The pending request covering this user, whether they asked for it or an
 * admin deleted the whole workspace out from under them. */
export async function activeRequestFor(ctx: AuthContext): Promise<DeletionRequest | null> {
  const [mine, workspace] = await Promise.all([
    requestsRef()
      .where("status", "==", "PENDING")
      .where("scope", "==", "ACCOUNT")
      .where("subjectId", "==", ctx.userId)
      .limit(1)
      .get(),
    requestsRef()
      .where("status", "==", "PENDING")
      .where("scope", "==", "WORKSPACE")
      .where("subjectId", "==", ctx.organizationId)
      .limit(1)
      .get(),
  ]);
  // Workspace first: it is the wider of the two and the one whose deadline
  // actually governs this user's data.
  const doc = workspace.docs[0] ?? mine.docs[0];
  return doc ? DeletionRequestSchema.parse(doc.data()) : null;
}

export async function deletionState(ctx: AuthContext, scope: DeletionScope): Promise<DeletionState> {
  const [request, subject] = await Promise.all([activeRequestFor(ctx), subjectFor(ctx)]);
  return { request, verdict: assessDeletion(subject, scope) };
}

export class DeletionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeletionNotAllowedError";
  }
}

export async function requestDeletion(
  ctx: AuthContext,
  scope: DeletionScope,
  now = Date.now()
): Promise<DeletionRequest> {
  const subject = await subjectFor(ctx);
  const verdict = assessDeletion(subject, scope);
  if (!verdict.allowed) throw new DeletionNotAllowedError(verdict.reason);

  const existing = await activeRequestFor(ctx);
  // Asking twice is not an error and must not restart the clock: a customer
  // who clicks again a week later would otherwise silently buy themselves
  // another thirty days without being told.
  if (existing) return existing;

  const effective = verdict.effectiveScope;
  const request: DeletionRequest = {
    requestId: crypto.randomUUID(),
    scope: effective,
    subjectId: effective === "WORKSPACE" ? ctx.organizationId : ctx.userId,
    organizationId: ctx.organizationId,
    requestedByUserId: ctx.userId,
    requestedByEmail: ctx.email,
    status: "PENDING",
    requestedAt: now,
    purgeAfter: purgeDueAt(now),
    cancelledAt: null,
    purgeStartedAt: null,
    purgedAt: null,
    failure: "",
    purgedUsers: 0,
    gmailRevoked: false,
  };
  await requestsRef().doc(request.requestId).set(request);
  return request;
}

export async function cancelDeletion(ctx: AuthContext, now = Date.now()): Promise<boolean> {
  const request = await activeRequestFor(ctx);
  if (!request) return false;
  // Only an admin can call off a workspace deletion, matching who could start
  // one. A rep cancelling their admin's decision would be a privilege bug.
  if (request.scope === "WORKSPACE" && ctx.role !== "ADMIN") {
    throw new DeletionNotAllowedError("Only an admin can cancel a workspace deletion.");
  }
  await requestsRef()
    .doc(request.requestId)
    .update({ status: "CANCELLED", cancelledAt: now });
  return true;
}

/**
 * Revoke the Google grant before the token is destroyed.
 *
 * Order matters and is the reason this is not folded into the recursive
 * delete: once the encrypted token is gone there is no way to tell Google the
 * grant is over, and Cadence would sit in the customer's Google account with
 * mailbox access they believe they revoked.
 */
async function revokeGmail(userId: string): Promise<boolean> {
  const connection = await getConnection(userId).catch(() => null);
  if (!connection || connection.status === "REVOKED") return false;
  try {
    const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
    await oauthClient().revokeToken(refreshToken);
    await markDisconnected(userId);
    return true;
  } catch {
    // Already revoked on Google's side, or the token no longer decrypts.
    // Either way the local copy is about to be destroyed regardless.
    return false;
  }
}

/** Everything under one user, plus their membership row. */
async function purgeUser(userId: string, organizationId: string): Promise<boolean> {
  const revoked = await revokeGmail(userId);
  // End any live session for this identity. Without it, a cookie issued before
  // the purge still verifies for up to five days, and requireUser would clear
  // the PURGED tombstone and provision a fresh empty account without the person
  // authenticating again. That is the intended outcome eventually, since a
  // deletion is not a ban, but it should be a deliberate new sign-in rather than
  // something an old cookie does by itself.
  await revokeAllSessionsQuietly(userId);
  const db = firestore();
  // Recursive: campaigns, recipients, queue, templates, sequences, contacts,
  // lead lists, suppressions, notifications, counters, settings, and the
  // encrypted Gmail token all live under users/{userId}.
  await db.recursiveDelete(db.collection("users").doc(userId));
  await db
    .collection("organizations")
    .doc(organizationId)
    .collection("members")
    .doc(userId)
    .delete()
    .catch(() => {
      /* Already gone: the membership row is not the record of record. */
    });
  return revoked;
}

/** Support tickets carry the subject's own words and workspace context. */
async function purgeSupportRequests(field: "userId" | "organizationId", value: string) {
  const snap = await firestore()
    .collection("supportRequests")
    .where(`diagnostics.${field}`, "==", value)
    .limit(500)
    .get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

/**
 * Destroy the data. Terminal, and reached only from the sweep once the grace
 * period has fully elapsed.
 *
 * The tombstone is written *before* anything is deleted, not after. A purge
 * that dies halfway would otherwise leave a half-deleted account that the next
 * sign-in happily re-provisions around, and the customer would be told their
 * data was gone while some of it was not.
 */
export async function executePurge(
  request: DeletionRequest,
  now = Date.now()
): Promise<DeletionRequest> {
  const ref = requestsRef().doc(request.requestId);
  await ref.update({ status: "PURGING", purgeStartedAt: now });

  try {
    const userIds =
      request.scope === "WORKSPACE"
        ? (await listMembers(request.organizationId)).map((m) => m.userId)
        : [request.subjectId];

    await Promise.all(
      userIds.map((userId) =>
        tombstonesRef()
          .doc(userId)
          .set({
            userId,
            requestId: request.requestId,
            scope: request.scope,
            status: "PURGING",
            at: now,
          } satisfies DeletedIdentity)
      )
    );

    let gmailRevoked = false;
    for (const userId of userIds) {
      // Sequential rather than parallel: each one revokes an OAuth grant and
      // recursively deletes a subtree, and a workspace of fifty would
      // otherwise open fifty concurrent recursive deletes.
      const revoked = await purgeUser(userId, request.organizationId);
      gmailRevoked = gmailRevoked || revoked;
    }

    if (request.scope === "WORKSPACE") {
      const db = firestore();
      await purgeSupportRequests("organizationId", request.organizationId);
      // Credentials to data that no longer exists. Left behind, they would be
      // live keys pointing at a deleted workspace.
      await purgeApiKeys(request.organizationId).catch(() => {
        /* Best effort: the data they addressed is going regardless. */
      });
      // Takes the organization's subcollections with it, which is where webhook
      // subscriptions and their queued deliveries live: see the note on
      // collection placement in lib/webhooks/store.ts. A delivery task already
      // in the queue finds no subscription and settles itself rather than
      // posting to an endpoint for a workspace that no longer exists.
      await db.recursiveDelete(db.collection("organizations").doc(request.organizationId));
      await db
        .collection("organizationSettings")
        .doc(request.organizationId)
        .delete()
        .catch(() => {});
    } else {
      await purgeSupportRequests("userId", request.subjectId);
    }

    await Promise.all(
      userIds.map((userId) =>
        tombstonesRef().doc(userId).update({ status: "PURGED", at: Date.now() })
      )
    );

    const done = {
      status: "PURGED" as const,
      purgedAt: Date.now(),
      purgedUsers: userIds.length,
      gmailRevoked,
    };
    await ref.update(done);
    return { ...request, ...done };
  } catch (err) {
    const failure = redactErrorMessage(err instanceof Error ? err.message : String(err)).slice(
      0,
      500
    );
    // FAILED rather than back to PENDING: a purge that threw partway needs a
    // human to look, and silently retrying it every hour would hammer the same
    // fault while telling nobody.
    await ref.update({ status: "FAILED", failure });
    throw err;
  }
}

/** Called by the sweep. Returns what it did, for the job summary. */
export async function purgeDueRequests(now = Date.now()): Promise<{
  considered: number;
  purged: number;
  failed: number;
}> {
  const snap = await requestsRef().where("status", "==", "PENDING").limit(50).get();
  let purged = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const request = DeletionRequestSchema.parse(doc.data());
    if (!isDue(request.purgeAfter, now)) continue;
    try {
      await executePurge(request, now);
      purged += 1;
    } catch (err) {
      failed += 1;
      console.error("[deletion] purge failed", {
        requestId: request.requestId,
        err: String(err),
      });
    }
  }
  return { considered: snap.size, purged, failed };
}

/** Read by the auth path, so a purged identity cannot quietly come back. */
export async function deletedIdentity(userId: string): Promise<DeletedIdentity | null> {
  const snap = await tombstonesRef().doc(userId).get();
  return snap.exists ? DeletedIdentitySchema.parse(snap.data()) : null;
}

/** Clear the marker so a genuinely new signup by the same person can proceed. */
export async function clearDeletedIdentity(userId: string): Promise<void> {
  await tombstonesRef().doc(userId).delete();
}

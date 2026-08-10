import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { reportError } from "@/lib/observability/report";
import { AuditEntrySchema, type AuditAction, type AuditEntry } from "@/schemas/audit";

/**
 * Writing and reading the audit trail.
 *
 * **Append-only in practice, not just by intent.** There is no update and no
 * delete in this module, and no route exposes one. The only thing that removes
 * an entry is the `recursiveDelete` of the organization during a workspace
 * purge, which is correct: an audit trail that outlived the workspace it
 * describes would be a record we promised to destroy.
 *
 * **Written after the action succeeds, and never allowed to fail it.** The
 * stricter discipline, refusing the action when it cannot be audited, is right
 * for a bank and wrong here: a Firestore blip would stop an admin turning off
 * live sending, which is the opposite of safe. So the trade is stated plainly.
 * An entry can be missing when the log write itself failed, and that failure
 * goes to the error sink rather than being swallowed. What cannot happen is an
 * entry describing something that did not occur.
 */

const auditRef = (organizationId: string) =>
  firestore().collection("organizations").doc(organizationId).collection("auditLog");

export interface AuditActor {
  organizationId: string;
  userId: string;
  email: string;
}

/** The actor for a signed-in request.
 *
 * A narrowing helper rather than passing the whole `AuthContext`, so an entry
 * cannot accidentally come to depend on request state that is not the actor. */
export function auditActor(ctx: {
  organizationId: string;
  userId: string;
  email: string;
}): AuditActor {
  return { organizationId: ctx.organizationId, userId: ctx.userId, email: ctx.email };
}

export async function recordAudit(
  actor: AuditActor,
  input: {
    action: AuditAction;
    summary: string;
    subject?: string;
    details?: Record<string, string | number | boolean | null>;
  }
): Promise<void> {
  try {
    const entry: AuditEntry = AuditEntrySchema.parse({
      entryId: crypto.randomUUID(),
      organizationId: actor.organizationId,
      action: input.action,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      subject: input.subject ?? "",
      summary: input.summary,
      details: input.details ?? {},
      at: Date.now(),
    });
    await auditRef(actor.organizationId).doc(entry.entryId).set(entry);
  } catch (err) {
    // See the module note: a failed audit write is reported, never raised.
    reportError(err, { scope: "audit.record", kind: input.action });
  }
}

export interface AuditPage {
  entries: AuditEntry[];
  /** The `at` of the last entry returned, for the next request. Null when the
   * page is the end of the log. */
  cursor: number | null;
}

/**
 * Read the log, newest first.
 *
 * Cursored on `at` rather than offset, because an offset shifts under a log that
 * is still being appended to and would show the reader duplicates as they page.
 * Two entries sharing a millisecond is possible, so the cursor is exclusive on
 * the timestamp and can in principle skip a same-millisecond sibling: an
 * acceptable trade against the alternative of a compound cursor, and the reason
 * the page size is generous.
 */
export async function listAuditLog(
  organizationId: string,
  options: { limit?: number; before?: number | null; action?: AuditAction | null } = {}
): Promise<AuditPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  let query = auditRef(organizationId).orderBy("at", "desc");
  if (options.action) query = query.where("action", "==", options.action);
  if (options.before) query = query.where("at", "<", options.before);

  const snap = await query.limit(limit).get();
  const entries = snap.docs.map((doc) => AuditEntrySchema.parse(doc.data()));
  return {
    entries,
    cursor: entries.length === limit ? entries[entries.length - 1].at : null,
  };
}

/** Whether anything has been recorded yet, for the empty state. */
export async function auditLogSize(organizationId: string): Promise<number> {
  const snap = await auditRef(organizationId).count().get();
  return snap.data().count;
}

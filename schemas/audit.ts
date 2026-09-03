import { z } from "zod";
import { EpochMillis } from "./common";

/**
 * The administrative audit trail.
 *
 * Separate from campaign events, which are campaign-scoped and describe
 * sending. This describes administration: who changed what about the workspace
 * itself. It is the first thing a security review asks for, and the thing that
 * answers "we did not do that" when a customer disputes a change.
 *
 * The action list is a closed enum rather than a free string. An open one drifts
 * into inconsistent spellings of the same event within a month, and a log you
 * cannot filter reliably is a log nobody reads.
 */
export const AUDIT_ACTIONS = [
  // Sending policy. The single most consequential switch in the product.
  "sending.mode_changed",
  "sending.ai_writing_changed",
  "sending.tracking_domain_changed",
  // Access.
  "member.role_changed",
  "member.deactivated",
  "member.reactivated",
  "invite.created",
  "invite.revoked",
  // Mailboxes.
  "gmail.connected",
  "gmail.disconnected",
  // Credentials that reach the workspace's data from outside it.
  "apikey.created",
  "apikey.revoked",
  "webhook.created",
  "webhook.deleted",
  "webhook.enabled",
  "webhook.disabled",
  // The data itself leaving or being destroyed.
  "data.exported",
  "account.deletion_requested",
  "account.deletion_cancelled",
  // Sessions.
  "session.revoked_everywhere",
  // Identity.
  "workspace.renamed",
  // Compliance decisions. An import that overrides the opt-out column in an
  // uploaded file is a judgement someone made on a particular day about what
  // that column meant, and it is exactly the kind of thing that gets asked
  // about later. The reason is recorded with it.
  "leads.opt_out_column_overridden",
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEntrySchema = z.object({
  entryId: z.string().min(1),
  organizationId: z.string().min(1),
  action: AuditActionSchema,
  actorUserId: z.string().min(1),
  /** Snapshotted at write time, not looked up at read time.
   *
   * The whole point of an audit entry is to survive the thing it describes. A
   * member who was removed leaves no document to resolve their id against, and
   * an entry that reads "user_9fA2..." answers nobody's question. */
  actorEmail: z.string().min(1),
  /** Who or what the action was performed on, when that is someone other than
   * the actor: a member's email, an endpoint URL, a key name. Snapshotted for
   * the same reason. Empty when the action is about the workspace itself. */
  subject: z.string().max(300).default(""),
  /** One readable sentence, written at the call site where the context exists.
   * Built there rather than reconstructed in the UI, because only the call site
   * knows what actually changed. */
  summary: z.string().min(1).max(400),
  /** Extra scalars for questions the summary does not answer, e.g. the previous
   * and new role. Deliberately not a place to put a payload: an audit log that
   * accumulates lead data becomes a second copy of the thing deletion destroys. */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  at: EpochMillis,
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

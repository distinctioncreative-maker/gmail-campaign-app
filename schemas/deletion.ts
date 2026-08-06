import { z } from "zod";
import { EpochMillis } from "./common";

export const DeletionScopeSchema = z.enum(["ACCOUNT", "WORKSPACE"]);

/**
 * PENDING is cancellable and the account works normally throughout: a grace
 * period nobody can act during is just a delay. PURGING is the in-flight
 * window, the only state in which sign-in is refused, because re-provisioning
 * a user mid-purge would rebuild the account being deleted. PURGED and
 * CANCELLED are terminal, and FAILED means a purge threw partway and needs a
 * human, which is worth knowing about rather than retrying blindly forever.
 */
export const DeletionStatusSchema = z.enum([
  "PENDING",
  "CANCELLED",
  "PURGING",
  "PURGED",
  "FAILED",
]);

export const DeletionRequestSchema = z.object({
  requestId: z.string().min(1),
  scope: DeletionScopeSchema,
  /** The user or organization being deleted, per scope. */
  subjectId: z.string().min(1),
  organizationId: z.string().min(1),
  requestedByUserId: z.string().min(1),
  requestedByEmail: z.string().email(),
  status: DeletionStatusSchema,
  requestedAt: EpochMillis,
  /** Nothing is destroyed before this instant. */
  purgeAfter: EpochMillis,
  cancelledAt: EpochMillis.nullable().default(null),
  purgeStartedAt: EpochMillis.nullable().default(null),
  purgedAt: EpochMillis.nullable().default(null),
  /** Why it failed, when it did. Redacted before it is written. */
  failure: z.string().max(500).default(""),
  /** What the purge actually removed, so a support question has an answer. */
  purgedUsers: z.number().int().nonnegative().default(0),
  gmailRevoked: z.boolean().default(false),
});
export type DeletionRequest = z.infer<typeof DeletionRequestSchema>;
export type DeletionStatus = z.infer<typeof DeletionStatusSchema>;

/**
 * The marker left behind for a deleted identity.
 *
 * Without it, deletion is not terminal: `requireUser` provisions a fresh user
 * document for any authenticated identity it does not recognise, so the next
 * sign-in after a purge would silently rebuild the account that was just
 * deleted, in the same organization.
 *
 * It stores no email and no name. It is the record of a deletion, and making
 * it a copy of the data that was deleted would defeat the point.
 */
export const DeletedIdentitySchema = z.object({
  userId: z.string().min(1),
  requestId: z.string().min(1),
  scope: DeletionScopeSchema,
  /** PURGING blocks sign-in; PURGED lets a genuinely new signup proceed. */
  status: z.enum(["PURGING", "PURGED"]),
  at: EpochMillis,
});
export type DeletedIdentity = z.infer<typeof DeletedIdentitySchema>;

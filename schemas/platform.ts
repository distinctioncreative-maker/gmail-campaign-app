import { z } from "zod";
import { EpochMillis } from "./common";
import { PLAN_IDS } from "@/lib/billing/plans";

/**
 * Platform-level state: the controls that belong to whoever runs the service
 * rather than to any customer.
 *
 * All of this lives outside every organization's subtree, in top-level
 * collections. That is not a filing preference: a workspace purge recursively
 * deletes the organization document, so a suspension or an operator's audit trail
 * stored inside it would be destroyed by the very customer it describes.
 */

/**
 * Who may sign up.
 *
 * Runtime rather than an environment variable, because the reason to change it is
 * usually urgent: a wave of throwaway accounts, or a spam incident that needs the
 * doors shut in the next thirty seconds rather than after a deploy. The env var
 * remains the fallback for a deployment that has never been configured.
 */
export const SIGNUP_MODES = ["closed", "allowlist", "open"] as const;
export const SignupModeSchema = z.enum(SIGNUP_MODES);
export type SignupMode = z.infer<typeof SignupModeSchema>;

export const PlatformSettingsSchema = z.object({
  /** Absent means "use the deployment's env default", which is why this is
   * nullable rather than defaulted: a stored `allowlist` and an unset value are
   * different facts, and only one of them was a decision. */
  signupMode: SignupModeSchema.nullable().default(null),
  /**
   * Read-only mode. Sign-in and reading keep working; launching a campaign,
   * importing, and sending do not.
   *
   * Deliberately not a hard site-down switch. Blocking the marketing site belongs
   * at the load balancer, and an in-app flag that pretended to do it would leave
   * the public pages up while claiming otherwise. What this actually buys is the
   * thing an incident needs: stopping mail from going out.
   */
  readOnlyMode: z.boolean().default(false),
  /** Shown to every signed-in user. Empty means no banner. */
  noticeBanner: z.string().max(280).default(""),
  noticeSeverity: z.enum(["INFO", "WARNING"]).default("INFO"),
  /** Global kill switch for outbound sending across every tenant. The heaviest
   * control in the product, and the one worth having on a bad day. */
  sendingHalted: z.boolean().default(false),
  haltReason: z.string().max(200).default(""),
  updatedAt: EpochMillis,
  updatedByEmail: z.string().default(""),
});
export type PlatformSettings = z.infer<typeof PlatformSettingsSchema>;

/** Why a workspace was stopped. Recorded because "we suspended you" is a
 * conversation, and it goes better with a reason attached. */
export const SUSPENSION_REASONS = [
  "SPAM_COMPLAINTS",
  "HIGH_BOUNCE_RATE",
  "PAYMENT_FAILED",
  "TERMS_VIOLATION",
  "SUSPECTED_COMPROMISE",
  "OPERATOR_REQUEST",
] as const;
export const SuspensionReasonSchema = z.enum(SUSPENSION_REASONS);
export type SuspensionReason = z.infer<typeof SuspensionReasonSchema>;

/**
 * A suspended workspace.
 *
 * Top-level and keyed by organization id, so a customer's own admins cannot
 * remove it and a workspace purge cannot either.
 */
export const WorkspaceSuspensionSchema = z.object({
  organizationId: z.string().min(1),
  reason: SuspensionReasonSchema,
  /** Shown to the customer. Written for them to read, not for internal notes. */
  message: z.string().max(400).default(""),
  /** Internal, never shown to the customer. */
  note: z.string().max(1000).default(""),
  suspendedByEmail: z.string().min(1),
  suspendedAt: EpochMillis,
});
export type WorkspaceSuspension = z.infer<typeof WorkspaceSuspensionSchema>;

/**
 * A banned identity.
 *
 * Separate from workspace suspension because the two answer different questions.
 * Suspending a workspace stops a company; banning an identity stops a person, who
 * can otherwise sign up again the next morning and start a fresh workspace.
 * Keyed by lowercased email rather than user id, since a banned person deleting
 * their Firebase account and signing in again produces a new uid.
 */
export const IdentityBanSchema = z.object({
  email: z.string().min(1),
  reason: SuspensionReasonSchema,
  note: z.string().max(1000).default(""),
  bannedByEmail: z.string().min(1),
  bannedAt: EpochMillis,
});
export type IdentityBan = z.infer<typeof IdentityBanSchema>;

/** A per-workspace plan override, for a comped, grandfathered, or negotiated
 * account. The plan catalog itself stays in code: see lib/billing/plans.ts and
 * the note in lib/platform/overrides.ts on why limits are not runtime-editable. */
export const PlanOverrideSchema = z.object({
  organizationId: z.string().min(1),
  plan: z.enum(PLAN_IDS as [string, ...string[]]),
  /** Why this workspace is not on the plan its subscription says. Required,
   * because an override with no explanation is indistinguishable from a mistake
   * six months later. */
  note: z.string().min(1).max(400),
  setByEmail: z.string().min(1),
  setAt: EpochMillis,
});
export type PlanOverride = z.infer<typeof PlanOverrideSchema>;

/**
 * The operator's own audit trail.
 *
 * Top-level, and never inside an organization: an operator's actions have to
 * outlive the workspace they were performed on, including one the operator
 * deleted. Append-only, like the per-workspace log, and for a sharper reason:
 * this is the record of the most privileged actions in the system.
 */
export const PLATFORM_AUDIT_ACTIONS = [
  "signup.mode",
  "readonly.mode",
  "sending.halted",
  "notice.banner",
  "workspace.suspend",
  "workspace.unsuspend",
  "identity.ban",
  "identity.unban",
  "plan.override",
  "plan.override_cleared",
  "checkup.viewed",
] as const;
export const PlatformAuditActionSchema = z.enum(PLATFORM_AUDIT_ACTIONS);
export type PlatformAuditAction = z.infer<typeof PlatformAuditActionSchema>;

export const PlatformAuditEntrySchema = z.object({
  entryId: z.string().min(1),
  action: PlatformAuditActionSchema,
  operatorEmail: z.string().min(1),
  /** What was acted on: an organization id, an email, a setting name. */
  subject: z.string().max(300).default(""),
  summary: z.string().min(1).max(400),
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  at: EpochMillis,
});
export type PlatformAuditEntry = z.infer<typeof PlatformAuditEntrySchema>;

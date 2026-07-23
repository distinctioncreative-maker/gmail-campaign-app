import { z } from "zod";
import { EpochMillis } from "./common";

export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "VALIDATING",
  "READY",
  "PREPARING",
  "ACTIVE",
  "PAUSED",
  "STOPPED",
  "CANCELLED",
  "COMPLETED",
  "ERROR",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const DraftStrategySchema = z.enum(["DRAFT_ONLY", "SEND"]);

export const PriorContactPolicySchema = z.enum([
  "ONLY_NEW",
  "EXCLUDE_RECENT",
  "INCLUDE_AFTER_WARNING",
  "INCLUDE_NEVER_REPLIED",
]);

export const CampaignScheduleSchema = z.object({
  timezone: z.string().default("America/New_York"),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5]),
  startAt: EpochMillis.nullable().default(null),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
  emailsPerBatch: z.number().int().min(1).max(50).default(5),
  minDelaySeconds: z.number().int().min(1).max(600).default(5),
  maxDelaySeconds: z.number().int().min(1).max(600).default(10),
  interBatchDelayMinutes: z.number().min(0).max(240).default(2),
  dailySendLimit: z.number().int().min(1).max(2000).default(100),
});
export type CampaignSchedule = z.infer<typeof CampaignScheduleSchema>;

export const CampaignSchema = z.object({
  campaignId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  createdByUserId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  status: CampaignStatusSchema,
  initialTemplateId: z.string().nullable().default(null),
  /** Optional A/B rotation: 2+ template IDs sent round-robin across recipients.
   * Empty ⇒ single-template campaign using initialTemplateId. */
  templateRotation: z.array(z.string()).default([]),
  sequenceId: z.string().nullable().default(null),
  sourceType: z.string().default("CONTACTS"),
  sourceReference: z.string().nullable().default(null),
  schedule: CampaignScheduleSchema,
  gmailQuotaReserve: z.number().int().min(0).default(50),
  priorContactPolicy: PriorContactPolicySchema.default("ONLY_NEW"),
  priorContactExcludeDays: z.number().int().min(1).max(365).default(30),
  draftStrategy: DraftStrategySchema.default("SEND"),
  totalRecipients: z.number().int().nonnegative().default(0),
  eligibleRecipients: z.number().int().nonnegative().default(0),
  excludedRecipients: z.number().int().nonnegative().default(0),
  draftedCount: z.number().int().nonnegative().default(0),
  sentCount: z.number().int().nonnegative().default(0),
  replyCount: z.number().int().nonnegative().default(0),
  bounceCount: z.number().int().nonnegative().default(0),
  unsubscribeCount: z.number().int().nonnegative().default(0),
  followupSentCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  followupsPaused: z.boolean().default(false),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
  startedAt: EpochMillis.nullable().default(null),
  pausedAt: EpochMillis.nullable().default(null),
  /** Day key (YYYY-MM-DD) the queue was last mass-deferred to after hitting
   * the daily limit — makes the re-spread run exactly once per day. */
  deferredDayKey: z.string().nullable().default(null),
  /** Hidden from the main campaigns list for tidiness (data is kept). */
  archived: z.boolean().default(false),
  resumedAt: EpochMillis.nullable().default(null),
  stoppedAt: EpochMillis.nullable().default(null),
  completedAt: EpochMillis.nullable().default(null),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const RecipientStatusSchema = z.enum([
  "PENDING",
  "SCHEDULED",
  "DRAFTED",
  "SENT",
  "REPLIED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "SKIPPED",
  "EXCLUDED",
  "CANCELLED",
  "ERROR",
]);
export type RecipientStatus = z.infer<typeof RecipientStatusSchema>;

export const RecipientSchema = z.object({
  recipientId: z.string().min(1),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  firstNameSnapshot: z.string().default(""),
  fullNameSnapshot: z.string().default(""),
  businessNameSnapshot: z.string().default(""),
  emailSnapshot: z.string().min(3),
  normalizedEmailSnapshot: z.string().min(3),
  phoneSnapshot: z.string().default(""),
  sourceRecordIdSnapshot: z.string().nullable().default(null),
  priorCampaignCount: z.number().int().nonnegative().default(0),
  priorCampaignWarning: z.boolean().default(false),
  teamCollisionWarning: z.boolean().default(false),
  included: z.boolean().default(true),
  exclusionReason: z.string().nullable().default(null),
  overrideReason: z.string().nullable().default(null),
  currentStep: z.number().int().nonnegative().default(0),
  status: RecipientStatusSchema.default("PENDING"),
  /** Which template this recipient was assigned (A/B rotation). Null ⇒ the
   * campaign's initialTemplateId. */
  templateIdSnapshot: z.string().nullable().default(null),
  initialDraftId: z.string().nullable().default(null),
  initialMessageId: z.string().nullable().default(null),
  gmailThreadId: z.string().nullable().default(null),
  initialScheduledAt: EpochMillis.nullable().default(null),
  initialSentAt: EpochMillis.nullable().default(null),
  lastSentAt: EpochMillis.nullable().default(null),
  repliedAt: EpochMillis.nullable().default(null),
  bounceType: z.enum(["HARD", "SOFT", "UNKNOWN"]).nullable().default(null),
  bouncedAt: EpochMillis.nullable().default(null),
  unsubscribedAt: EpochMillis.nullable().default(null),
  nextFollowupAt: EpochMillis.nullable().default(null),
  lastError: z.string().nullable().default(null),
  retryCount: z.number().int().nonnegative().default(0),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Recipient = z.infer<typeof RecipientSchema>;

export const QueueItemTypeSchema = z.enum([
  "CREATE_INITIAL_DRAFT",
  "SEND_INITIAL",
  "CREATE_FOLLOWUP_DRAFT",
  "SEND_FOLLOWUP",
  "CHECK_REPLY",
  "CHECK_BOUNCE",
  "SYNC_AUDIT_SHEET",
]);
export type QueueItemType = z.infer<typeof QueueItemTypeSchema>;

export const QueueItemStatusSchema = z.enum([
  "PENDING",
  "SCHEDULED",
  "PROCESSING",
  "COMPLETE",
  "SKIPPED",
  "CANCELLED",
  "ERROR",
  "RETRY_SCHEDULED",
]);
export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>;

export const QueueItemSchema = z.object({
  queueItemId: z.string().min(1),
  organizationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  campaignId: z.string().min(1),
  recipientId: z.string().min(1),
  type: QueueItemTypeSchema,
  sequenceStep: z.number().int().nonnegative().default(0),
  scheduledAt: EpochMillis,
  status: QueueItemStatusSchema.default("SCHEDULED"),
  attemptCount: z.number().int().nonnegative().default(0),
  idempotencyKey: z.string().min(1),
  cloudTaskName: z.string().nullable().default(null),
  startedAt: EpochMillis.nullable().default(null),
  completedAt: EpochMillis.nullable().default(null),
  lastError: z.string().nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const CampaignEventSchema = z.object({
  eventId: z.string().min(1),
  campaignId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  type: z.string().min(1),
  /** Plain-language description shown in the activity feed. */
  message: z.string().min(1),
  recipientEmail: z.string().nullable().default(null),
  severity: z.enum(["INFO", "WARNING", "ERROR"]).default("INFO"),
  createdAt: EpochMillis,
});
export type CampaignEvent = z.infer<typeof CampaignEventSchema>;

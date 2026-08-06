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
  /** How the day's allowance is laid out across the window.
   *
   * SPREAD divides the window by the daily limit so a hundred emails occupy
   * eleven hours. BURST is the original behaviour, sending as fast as the
   * batch settings allow until the cap stops it, kept because some senders
   * genuinely want a tight morning block.
   *
   * Already-running campaigns are unaffected either way: their send times are
   * computed once at launch, so nothing reshapes underneath an owner. A
   * campaign document written before this field existed reads as undefined
   * and is treated as SPREAD. See lib/scheduling/window.ts. */
  pacingMode: z.enum(["SPREAD", "BURST"]).default("SPREAD"),
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
  /** Deal outcomes rolled up from recipients, so a campaign list or report can
   * show what the campaign produced without reading every recipient. Kept in
   * sync by a read-then-delta transaction (lib/campaigns/outcomes.ts); a
   * naive increment would double-count a corrected deal value. */
  meetingCount: z.number().int().nonnegative().default(0),
  wonCount: z.number().int().nonnegative().default(0),
  lostCount: z.number().int().nonnegative().default(0),
  /** Minor units. Sum of dealValueCents across recipients marked WON. */
  wonValueCents: z.number().int().nonnegative().default(0),
  followupsPaused: z.boolean().default(false),
  /** Which connected inboxes this campaign may send from.
   *
   * Empty means every healthy inbox, which is what a single-inbox account has
   * always effectively done. When it is set, it is honoured strictly: an
   * unavailable chosen sender makes the campaign wait rather than quietly
   * sending from an address the customer excluded. See lib/sending/inboxPool.ts. */
  senderConnectionIds: z.array(z.string()).default([]),
  /** Open and click tracking are separate trades and are now separate flags.
   * See lib/tracking/settings.ts for why both default off: the pixel is a
   * remote image in a cold email in exchange for a number Apple MPP has made
   * mostly fiction, and every rewritten link points at one hostname shared by
   * every customer on the platform.
   *
   * Deliberately `.optional()` and not `.default(false)`. Every read goes
   * through this schema, so a default would materialise `false` on campaigns
   * written before the split and resolveTracking could never tell "the owner
   * chose off" from "this field did not exist yet". Absent has to stay absent
   * for the fallback below to mean anything. New campaigns always write both
   * explicitly, so absent identifies a pre-split document and nothing else. */
  openTrackingEnabled: z.boolean().optional(),
  clickTrackingEnabled: z.boolean().optional(),
  /** @deprecated Superseded by the two flags above. Retained because
   * campaigns written before the split carry only this, and resolveTracking
   * falls back to it: reading a missing new field as "off" would silently
   * stop tracking on running campaigns whose owners chose it. */
  trackingEnabled: z.boolean().default(false),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
  startedAt: EpochMillis.nullable().default(null),
  /** Set by the transactional launch claim. PREPARING campaigns can be safely
   * returned to READY when setup fails before activation. */
  launchStartedAt: EpochMillis.nullable().default(null),
  pausedAt: EpochMillis.nullable().default(null),
  /** Day key (YYYY-MM-DD) the queue was last mass-deferred to after hitting
   * the daily limit — makes the re-spread run exactly once per day. */
  deferredDayKey: z.string().nullable().default(null),
  /** Hidden from the main campaigns list for tidiness (data is kept). */
  archived: z.boolean().default(false),
  archivedAt: EpochMillis.nullable().default(null),
  /** Soft-deleted campaigns retain recipients, messages, events, and metrics
   * until a user explicitly deletes them forever from Recently Deleted. */
  deletedAt: EpochMillis.nullable().default(null),
  resumedAt: EpochMillis.nullable().default(null),
  stoppedAt: EpochMillis.nullable().default(null),
  completedAt: EpochMillis.nullable().default(null),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** The three states a conversation can land in after someone replies.
 *
 * Deliberately not a pipeline. A rep already owns a CRM; what they do not
 * have is a way to tell this product that the email worked. Three states and
 * an optional number is the smallest thing that makes reporting honest. */
export const DealStatusSchema = z.enum(["MEETING_BOOKED", "WON", "LOST"]);
export type DealStatus = z.infer<typeof DealStatusSchema>;

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
  /** Coarse intent of the latest human reply, for triage in the inbox:
   * INTERESTED (hot — positive signal), REPLIED (needs attention), or
   * NOT_INTERESTED. Null until a human reply lands. */
  replyIntent: z.enum(["INTERESTED", "REPLIED", "NOT_INTERESTED"]).nullable().default(null),
  /** First chars of what the person actually typed (quoted history stripped)
   * — shown in the inbox and used to seed AI reply drafts. */
  lastReplySnippet: z.string().default(""),
  /** The inbox this recipient's initial email actually left from.
   *
   * Null for anything sent before rotation existed. A threaded follow-up has to
   * leave from the same inbox or the recipient sees a stranger replying inside
   * their conversation and Gmail will not thread it, so this is read before
   * every follow-up rather than treated as reporting metadata. */
  sentFromConnectionId: z.string().nullable().default(null),
  /** What the conversation actually became.
   *
   * Distinct from `replyIntent`, which is how the reply *read*. This is what
   * the rep *did* about it, and it is the only place the product records
   * whether outreach earned anything. Null until a human sets it: nothing
   * here is ever inferred from message text, because a wrong revenue number
   * is worse than a missing one. */
  dealStatus: DealStatusSchema.nullable().default(null),
  /** Minor units (cents), to avoid float drift on money. Null when the rep
   * marked a win without knowing the number, which must stay possible. */
  dealValueCents: z.number().int().nonnegative().nullable().default(null),
  dealNote: z.string().max(500).default(""),
  dealUpdatedAt: EpochMillis.nullable().default(null),
  /** Sticky once a meeting is reached, and preserved through a later loss:
   * a deal lost after a meeting still had one. Only clearing the outcome
   * removes it. Without this the funnel could show fewer meetings than wins. */
  meetingBookedAt: EpochMillis.nullable().default(null),
  /** Optional AI-personalized opening line for this recipient's initial email
   * (empty unless the campaign opted into personalization). */
  aiOpenerSnapshot: z.string().default(""),
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
  /** Set only when the campaign has trackingEnabled. openedAt/firstClickedAt
   * are set once (first open/click); *Count keeps incrementing. The original
   * destination URLs live here server-side so the click-redirect endpoint
   * never trusts a client-supplied URL (avoids an open-redirect). */
  openedAt: EpochMillis.nullable().default(null),
  openCount: z.number().int().nonnegative().default(0),
  firstClickedAt: EpochMillis.nullable().default(null),
  clickCount: z.number().int().nonnegative().default(0),
  /** Keyed by sequence step ("0" = initial, "1"+ = follow-ups) since each
   * send has its own set of links — a flat array would get overwritten by
   * the next send and break tracking for earlier messages. */
  trackedLinkUrls: z.record(z.string(), z.array(z.string())).default({}),
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
  /** Gmail may have accepted the request, but the worker did not receive or
   * persist a definitive result. Never retry automatically or manually. */
  "AMBIGUOUS",
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

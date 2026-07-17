import type { Campaign, QueueItem, Recipient } from "@/schemas/campaign";
import { isInWindow } from "@/lib/scheduling/window";

/**
 * The pre-send eligibility re-check (spec §14). Pure so it is fully
 * unit-testable; the worker gathers state and calls this immediately
 * before any Gmail call. Any single failure blocks the send.
 */

export interface EligibilityInput {
  campaign: Pick<Campaign, "status" | "schedule" | "followupsPaused">;
  recipient: Pick<
    Recipient,
    "included" | "status" | "repliedAt" | "bouncedAt" | "unsubscribedAt"
  >;
  queueItem: Pick<QueueItem, "status" | "type">;
  gmailConnected: boolean;
  suppressed: boolean;
  emailOptOut: boolean;
  idempotencyKeyUsed: boolean;
  now: number;
  sentTodayCount: number;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string; retryable: boolean };

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { campaign, recipient, queueItem } = input;

  // Replay safety first: a completed/cancelled item never runs again.
  if (queueItem.status !== "PROCESSING") {
    return { eligible: false, reason: "QUEUE_ITEM_NOT_CLAIMED", retryable: false };
  }
  if (input.idempotencyKeyUsed) {
    return { eligible: false, reason: "ALREADY_SENT", retryable: false };
  }

  if (campaign.status !== "ACTIVE") {
    return { eligible: false, reason: `CAMPAIGN_${campaign.status}`, retryable: false };
  }
  const isFollowup =
    queueItem.type === "SEND_FOLLOWUP" || queueItem.type === "CREATE_FOLLOWUP_DRAFT";
  if (isFollowup && campaign.followupsPaused) {
    return { eligible: false, reason: "FOLLOWUPS_PAUSED", retryable: false };
  }

  if (!input.gmailConnected) {
    return { eligible: false, reason: "GMAIL_NOT_CONNECTED", retryable: false };
  }

  if (!recipient.included) {
    return { eligible: false, reason: "RECIPIENT_EXCLUDED", retryable: false };
  }
  if (recipient.status === "CANCELLED" || recipient.status === "SKIPPED") {
    return { eligible: false, reason: "RECIPIENT_CANCELLED", retryable: false };
  }
  if (recipient.repliedAt !== null) {
    return { eligible: false, reason: "RECIPIENT_REPLIED", retryable: false };
  }
  if (recipient.bouncedAt !== null) {
    return { eligible: false, reason: "RECIPIENT_BOUNCED", retryable: false };
  }
  if (recipient.unsubscribedAt !== null) {
    return { eligible: false, reason: "RECIPIENT_UNSUBSCRIBED", retryable: false };
  }
  if (input.suppressed || input.emailOptOut) {
    return { eligible: false, reason: "RECIPIENT_SUPPRESSED", retryable: false };
  }

  if (!isInWindow(input.now, campaign.schedule)) {
    return { eligible: false, reason: "OUTSIDE_SEND_WINDOW", retryable: true };
  }
  if (input.sentTodayCount >= campaign.schedule.dailySendLimit) {
    return { eligible: false, reason: "DAILY_LIMIT_REACHED", retryable: true };
  }

  return { eligible: true };
}

import "server-only";
import type { Campaign } from "@/schemas/campaign";
import type { OwnerRef } from "@/lib/repositories/campaigns";

/**
 * Schedule the next follow-up step for a recipient after a confirmed send.
 * Sequences arrive in Phase D; until then campaigns without a sequence
 * simply have no follow-up work, which this correctly handles.
 */
export async function scheduleNextFollowup(
  _owner: OwnerRef,
  campaign: Campaign,
  _recipientId: string,
  _completedStep: number
): Promise<void> {
  if (!campaign.sequenceId) return;
  // Phase D implements sequence-step scheduling here.
}

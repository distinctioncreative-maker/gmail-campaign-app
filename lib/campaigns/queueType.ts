import "server-only";
import type { Campaign, QueueItemType } from "@/schemas/campaign";

/**
 * Whether a queued message is sent or written as a Gmail draft.
 *
 * This exists because the decision was being made in two places and only one
 * of them made it. `launch.ts` branched on `draftStrategy` for the initial
 * message; `followups.ts` hard-coded `SEND_FOLLOWUP`. So a campaign set to
 * DRAFT_ONLY wrote a draft for the first email and then, days later, sent
 * every follow-up as real mail to real people. That is the single thing the
 * mode promises not to do, and the promise was kept for exactly one message.
 *
 * The worker had always handled `CREATE_FOLLOWUP_DRAFT` and treated it
 * identically to `CREATE_INITIAL_DRAFT`. Nothing produced it. The gap was
 * entirely on the enqueue side, which is why it is closed here, in one
 * function, rather than by adding a second copy of the same conditional next
 * to the first.
 *
 * `draftStrategy` defaults to "SEND" in the schema, so a campaign that predates
 * the field sends, exactly as it does today.
 */
export function queueTypeFor(
  campaign: Pick<Campaign, "draftStrategy">,
  stage: "initial" | "followup"
): QueueItemType {
  const draftOnly = campaign.draftStrategy === "DRAFT_ONLY";
  if (stage === "initial") return draftOnly ? "CREATE_INITIAL_DRAFT" : "SEND_INITIAL";
  return draftOnly ? "CREATE_FOLLOWUP_DRAFT" : "SEND_FOLLOWUP";
}

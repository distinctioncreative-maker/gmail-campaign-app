/**
 * Reply rate as a pacing input.
 *
 * Positive engagement is the strongest signal a mailbox provider has. A campaign
 * that people answer looks like correspondence; one that nobody answers looks
 * like bulk mail, and providers weight the difference heavily. The product
 * measured reply rate on two pages and used it for nothing.
 *
 * **This adjustment only ever lowers, and that is a deliberate departure from
 * the plan.** The backlog asked for a term that could raise volume by up to 50%
 * as well as lower it by 50%. Raising is wrong here, for the same reason
 * multi-inbox rotation does not multiply a campaign's limit: every other term in
 * the composition is a ceiling, and the customer's chosen daily limit is the
 * amount of mail they authorised. A product that quietly sends 120 when someone
 * typed 80 has taken a decision that was not offered to it, and the surprise
 * lands as mail in strangers' inboxes rather than as a number on a screen.
 *
 * The reward half of the idea is still delivered, as `suggestedLimit`: a
 * campaign replying well is told it has earned more volume, and a person decides
 * whether to take it. Same information, decision in the right place.
 *
 * Pure, so the identical judgement runs in the worker, on the campaign page, and
 * in diagnostics.
 */

export type EngagementVerdict = "UNPROVEN" | "STRONG" | "HEALTHY" | "WEAK" | "POOR";

export interface EngagementThresholds {
  /** Sends required before a reply rate means anything at all. */
  minimumSends: number;
  /** At or below this, pacing halves. */
  poorRate: number;
  /** At or below this, pacing eases off. */
  weakRate: number;
  /** At or above this, the campaign has earned an offer of more volume. */
  strongRate: number;
}

/**
 * Cold outreach reply rates run roughly 1% to 5%, and a good campaign clears 8%.
 *
 * The sample floor is doing more work than the rates. Sixty sends is high on
 * purpose: reply rate is a slow signal, because a reply can arrive days after
 * the send, so an early zero says nothing except that it is early. Throttling a
 * campaign on its first morning because nobody has answered yet would be both
 * wrong and the kind of wrong that is hard to explain to the person watching it.
 */
export const DEFAULT_ENGAGEMENT: EngagementThresholds = {
  minimumSends: 60,
  poorRate: 0.005,
  weakRate: 0.02,
  strongRate: 0.08,
};

/** The most this may cut a campaign's chosen limit. Halved, never further:
 * beyond that the campaign is effectively stopped, and stopping is a decision
 * that belongs to the bounce brake or to a person, not to a slow signal. */
export const MIN_ENGAGEMENT_FACTOR = 0.5;

export interface EngagementAssessment {
  verdict: EngagementVerdict;
  replyRate: number;
  sent: number;
  replied: number;
  /** Multiplier for the campaign's chosen daily limit. Never above 1. */
  factor: number;
  /** What a person should read. Null when there is nothing worth saying. */
  message: string | null;
  /** Set only on STRONG: the higher daily limit this campaign has earned, for a
   * person to accept or ignore. Never applied automatically. */
  suggestedLimit: number | null;
}

export function assessEngagement(
  input: { sentCount: number; replyCount: number; dailySendLimit?: number },
  thresholds: EngagementThresholds = DEFAULT_ENGAGEMENT
): EngagementAssessment {
  // Coerced rather than trusted. A counter absent from a campaign written
  // before it existed reads as undefined, and NaN would compare false against
  // every threshold below and silently disable the whole mechanism.
  const sent = safeCount(input.sentCount);
  const replied = safeCount(input.replyCount);
  const replyRate = sent > 0 ? replied / sent : 0;
  const base = { replyRate, sent, replied };

  if (sent < thresholds.minimumSends) {
    return {
      ...base,
      verdict: "UNPROVEN",
      factor: 1,
      message: null,
      suggestedLimit: null,
    };
  }

  const percent = (replyRate * 100).toFixed(1);

  if (replyRate <= thresholds.poorRate) {
    return {
      ...base,
      verdict: "POOR",
      factor: MIN_ENGAGEMENT_FACTOR,
      message: `${replied} replies from ${sent} sends is ${percent}%. Sending is at half speed while that holds, because volume with no engagement is the pattern providers filter on. The list or the opening line is usually the cause.`,
      suggestedLimit: null,
    };
  }

  if (replyRate <= thresholds.weakRate) {
    return {
      ...base,
      verdict: "WEAK",
      factor: 0.75,
      message: `${percent}% reply rate (${replied} of ${sent}). Sending is eased back a little while that improves. Anything under ${(thresholds.weakRate * 100).toFixed(0)}% is below what cold outreach normally returns.`,
      suggestedLimit: null,
    };
  }

  if (replyRate >= thresholds.strongRate) {
    const suggested = suggestedLimitFor(input.dailySendLimit);
    return {
      ...base,
      verdict: "STRONG",
      factor: 1,
      message: `${percent}% reply rate (${replied} of ${sent}), which is well above average.${
        suggested === null ? "" : ` This campaign has earned more volume: raising the daily limit to ${suggested} would be safe.`
      }`,
      suggestedLimit: suggested,
    };
  }

  return {
    ...base,
    verdict: "HEALTHY",
    factor: 1,
    message: null,
    suggestedLimit: null,
  };
}

/**
 * The daily cap after the engagement term.
 *
 * Returns a whole number of emails, and never zero: a campaign throttled to
 * nothing would look identical to a broken one. Composed by the caller with
 * `Math.min` alongside the campaign limit, the plan cap, and warmup.
 */
export function engagementDailyCap(
  dailySendLimit: number,
  assessment: EngagementAssessment
): number {
  const limit = safeCount(dailySendLimit);
  if (limit <= 0) return 0;
  return Math.max(1, Math.floor(limit * assessment.factor));
}

/**
 * The raise a strong campaign has earned. Capped at the point where the pace
 * checks in lib/campaigns/paceSafety.ts would start objecting, so the product
 * never suggests a number it would then warn about.
 */
function suggestedLimitFor(dailySendLimit: number | undefined): number | null {
  const limit = safeCount(dailySendLimit);
  if (limit <= 0) return null;
  const raised = Math.min(150, Math.round(limit * 1.5));
  return raised > limit ? raised : null;
}

function safeCount(value: number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

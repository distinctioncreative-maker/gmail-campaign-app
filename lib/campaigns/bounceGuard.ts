/**
 * The brake.
 *
 * Bounces were counted, displayed on two pages, and acted on by nothing. A
 * campaign built from a stale list would hard-bounce its way to completion at
 * full speed, and the first anyone knew was a domain reputation already spent.
 * Mailbox providers read a high hard-bounce rate as the signature of a list
 * that was never opted in, and it is one of the fastest ways to get filtered.
 *
 * So sending now stops itself. Pure, so the thresholds are testable and the
 * same decision runs in the worker, in the campaign UI, and in diagnostics.
 */

export type BounceVerdict = "OK" | "WARN" | "STOP";

export interface BounceGuardThresholds {
  /** Fraction of sends that bounced, above which we warn. */
  warnRate: number;
  /** Fraction above which the campaign pauses itself. */
  stopRate: number;
  /** Sends required before either rate means anything. */
  minimumSends: number;
}

/**
 * Two percent is where providers start to notice, five is where they act.
 *
 * The sample floor matters more than the rates: one bounce out of three is
 * 33% and tells you nothing, and tripping on it would make the brake useless
 * noise that customers learn to ignore.
 */
export const DEFAULT_BOUNCE_GUARD: BounceGuardThresholds = {
  warnRate: 0.02,
  stopRate: 0.05,
  minimumSends: 20,
};

/**
 * The loosest a customer may set the brake.
 *
 * Thresholds are customizable because a warmed domain with a verified list has
 * a genuinely different tolerance to a cold one. They are clamped because a
 * brake a user can disable is not a safety feature, and because the reputation
 * being spent is partly ours: every customer shares the sending platform's
 * standing with the providers.
 */
export const MAX_BOUNCE_GUARD: BounceGuardThresholds = {
  warnRate: 0.05,
  stopRate: 0.10,
  minimumSends: 100,
};

/** Clamp customer-supplied thresholds into the range we will honour. */
export function clampThresholds(input: Partial<BounceGuardThresholds>): BounceGuardThresholds {
  const warnRate = clamp(input.warnRate ?? DEFAULT_BOUNCE_GUARD.warnRate, 0.001, MAX_BOUNCE_GUARD.warnRate);
  const stopRate = clamp(input.stopRate ?? DEFAULT_BOUNCE_GUARD.stopRate, 0.002, MAX_BOUNCE_GUARD.stopRate);
  return {
    warnRate: Math.min(warnRate, stopRate),
    stopRate,
    minimumSends: Math.round(
      clamp(input.minimumSends ?? DEFAULT_BOUNCE_GUARD.minimumSends, 5, MAX_BOUNCE_GUARD.minimumSends)
    ),
  };
}

function clamp(value: number, low: number, high: number): number {
  // Coerced: a counter absent from a document written before it existed reads
  // as undefined, and NaN here would compare false against every threshold and
  // silently disable the brake.
  const n = Number(value);
  if (!Number.isFinite(n)) return low;
  return Math.min(high, Math.max(low, n));
}

export interface BounceAssessment {
  verdict: BounceVerdict;
  rate: number;
  sent: number;
  bounced: number;
  /** Null when the sample is too small to judge. */
  message: string | null;
}

export function assessBounces(
  input: { sentCount: number; bounceCount: number },
  thresholds: BounceGuardThresholds = DEFAULT_BOUNCE_GUARD
): BounceAssessment {
  const sent = Number(input.sentCount);
  const bounced = Number(input.bounceCount);
  const safeSent = Number.isFinite(sent) ? sent : 0;
  const safeBounced = Number.isFinite(bounced) ? bounced : 0;
  const rate = safeSent > 0 ? safeBounced / safeSent : 0;

  if (safeSent < thresholds.minimumSends) {
    return { verdict: "OK", rate, sent: safeSent, bounced: safeBounced, message: null };
  }
  const percent = (rate * 100).toFixed(1);
  if (rate >= thresholds.stopRate) {
    return {
      verdict: "STOP",
      rate,
      sent: safeSent,
      bounced: safeBounced,
      message: `Paused automatically: ${percent}% of this campaign's emails bounced (${safeBounced} of ${safeSent}). That rate damages your sending reputation with every further send. Clean the list, then resume.`,
    };
  }
  if (rate >= thresholds.warnRate) {
    return {
      verdict: "WARN",
      rate,
      sent: safeSent,
      bounced: safeBounced,
      message: `${percent}% of this campaign's emails have bounced (${safeBounced} of ${safeSent}). Above ${(thresholds.stopRate * 100).toFixed(0)}% sending stops automatically.`,
    };
  }
  return { verdict: "OK", rate, sent: safeSent, bounced: safeBounced, message: null };
}

/** True when this assessment should halt an active campaign. */
export function shouldPause(assessment: BounceAssessment): boolean {
  return assessment.verdict === "STOP";
}

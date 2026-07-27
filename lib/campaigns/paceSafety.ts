/**
 * Flags sending settings that risk deliverability, using the same "boring
 * volume" guidance already shown on the Deliverability page (50-100 emails
 * per day, spread out, no big spikes). Pure so it's usable from both the
 * campaign wizard and CampaignControls' pace editor, client and server.
 */
export interface PaceInput {
  emailsPerBatch: number;
  minDelaySeconds: number;
  dailySendLimit: number;
}

export interface PaceRisk {
  risky: boolean;
  reasons: string[];
}

const DAILY_LIMIT_SAFE_MAX = 150;
const MIN_DELAY_SAFE_FLOOR = 3;
const BATCH_SIZE_SAFE_MAX = 10;

export function assessPaceRisk(pace: PaceInput): PaceRisk {
  const reasons: string[] = [];

  if (pace.dailySendLimit > DAILY_LIMIT_SAFE_MAX) {
    reasons.push(
      `${pace.dailySendLimit} emails a day is well above the ~50–100/day range that keeps sending boring and safe.`
    );
  }
  if (pace.minDelaySeconds < MIN_DELAY_SAFE_FLOOR) {
    reasons.push(
      `Under ${MIN_DELAY_SAFE_FLOOR} seconds between emails reads as automated, not human-paced.`
    );
  }
  if (pace.emailsPerBatch > BATCH_SIZE_SAFE_MAX) {
    reasons.push(
      `More than ${BATCH_SIZE_SAFE_MAX} emails in one burst creates a spike that looks like spam.`
    );
  }

  return { risky: reasons.length > 0, reasons };
}

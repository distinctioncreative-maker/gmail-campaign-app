/**
 * Flags sending settings that risk deliverability.
 *
 * This used to look at exactly three knobs, daily limit, min delay, and batch
 * size, and never at how the volume actually landed across the day. The
 * shipped defaults passed it while putting a hundred emails out in the first
 * forty-eight minutes of an eleven-hour window, at roughly 125 an hour. Rate
 * is what a filter sees, so rate is what this checks now.
 *
 * Pure, so it runs in the campaign wizard, in CampaignControls' pace editor,
 * and on the server before a launch is accepted.
 */
import {
  effectiveSendsPerHour,
  spreadIntervalMinutes,
  windowMinutes,
  type PacingMode,
} from "@/lib/scheduling/window";

export interface PaceInput {
  emailsPerBatch: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  interBatchDelayMinutes: number;
  dailySendLimit: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  pacingMode?: PacingMode;
}

export interface PaceRisk {
  risky: boolean;
  reasons: string[];
  /** Sends per hour while the window is open: the headline number. */
  sendsPerHour: number;
  /** Average minutes between sends, for a plain-language summary. */
  intervalMinutes: number;
}

const DAILY_LIMIT_SAFE_MAX = 150;
/** Above this, sending stops looking like a person working through a list.
 * Twenty an hour is one every three minutes: brisk, but human. */
const SENDS_PER_HOUR_SAFE_MAX = 20;
const MIN_DELAY_SAFE_FLOOR = 3;
const BATCH_SIZE_SAFE_MAX = 10;
/** A window this short cannot spread anything, whatever the mode says. */
const WINDOW_MINUTES_SAFE_MIN = 120;

export function assessPaceRisk(pace: PaceInput): PaceRisk {
  const reasons: string[] = [];
  const mode = pace.pacingMode ?? "SPREAD";
  const sendsPerHour = effectiveSendsPerHour(pace);
  const intervalMinutes = spreadIntervalMinutes(pace);
  const window = windowMinutes(pace);

  if (pace.dailySendLimit > DAILY_LIMIT_SAFE_MAX) {
    reasons.push(
      `${pace.dailySendLimit} emails a day is well above the 50 to 100 a day range that keeps sending boring and safe.`
    );
  }

  // The check that would have caught the shipped default.
  if (sendsPerHour > SENDS_PER_HOUR_SAFE_MAX) {
    reasons.push(
      `About ${Math.round(sendsPerHour)} emails an hour while the window is open. Above roughly ${SENDS_PER_HOUR_SAFE_MAX} an hour the pattern reads as a script rather than a person.`
    );
  }

  if (window < WINDOW_MINUTES_SAFE_MIN) {
    reasons.push(
      `A ${Math.round(window)} minute sending window is too narrow to spread anything. Widen the hours so the day's emails are not one burst.`
    );
  }

  if (mode === "BURST") {
    reasons.push(
      "Burst pacing sends the whole day's allowance as fast as the batch settings allow, then goes quiet. Spread pacing is the safer default."
    );
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
  }

  return { risky: reasons.length > 0, reasons, sendsPerHour, intervalMinutes };
}

export interface PacePreset {
  id: "gentle" | "steady" | "brisk";
  label: string;
  /** What a filter sees, in plain words. The presets this replaces were
   * described in queue mechanics ("3 per batch, 10 to 20s apart"), which is
   * exactly the framing that let a 125-an-hour default look reasonable. */
  description: string;
  schedule: PaceInput;
}

/**
 * Named starting points, so a customer picks an intent instead of guessing at
 * five interacting numbers. These set the fields, they do not lock them:
 * every value stays editable, and editing simply moves you to Custom.
 */
export const PACE_PRESETS: readonly PacePreset[] = [
  {
    id: "gentle",
    label: "Gentle",
    description:
      "40 a day over a nine-hour window: about one every 14 minutes. The safest choice for a new inbox or a cold domain.",
    schedule: {
      dailySendLimit: 40,
      sendWindowStart: "09:00",
      sendWindowEnd: "18:00",
      pacingMode: "SPREAD",
      emailsPerBatch: 3,
      minDelaySeconds: 10,
      maxDelaySeconds: 20,
      interBatchDelayMinutes: 5,
    },
  },
  {
    id: "steady",
    label: "Steady",
    description:
      "80 a day across eleven hours: about one every 8 minutes. A good default once an inbox has some sending history.",
    schedule: {
      dailySendLimit: 80,
      sendWindowStart: "09:00",
      sendWindowEnd: "20:00",
      pacingMode: "SPREAD",
      emailsPerBatch: 5,
      minDelaySeconds: 5,
      maxDelaySeconds: 10,
      interBatchDelayMinutes: 2,
    },
  },
  {
    id: "brisk",
    label: "Brisk",
    description:
      "150 a day across twelve hours: about one every 5 minutes. Only for a warmed inbox on a domain with a clean record.",
    schedule: {
      dailySendLimit: 150,
      sendWindowStart: "08:00",
      sendWindowEnd: "20:00",
      pacingMode: "SPREAD",
      emailsPerBatch: 5,
      minDelaySeconds: 5,
      maxDelaySeconds: 10,
      interBatchDelayMinutes: 2,
    },
  },
] as const;

/** Which preset a schedule currently matches, or null when it is custom. */
export function matchPreset(pace: PaceInput): PacePreset["id"] | null {
  const found = PACE_PRESETS.find(
    (preset) =>
      preset.schedule.dailySendLimit === pace.dailySendLimit &&
      preset.schedule.sendWindowStart === pace.sendWindowStart &&
      preset.schedule.sendWindowEnd === pace.sendWindowEnd &&
      preset.schedule.pacingMode === (pace.pacingMode ?? "SPREAD")
  );
  return found?.id ?? null;
}

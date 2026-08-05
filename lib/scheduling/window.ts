/**
 * Sending-window math. All calculations happen in the campaign's IANA
 * timezone using Intl (no date libraries). Times are epoch millis.
 */

export interface WindowConfig {
  timezone: string;
  allowedWeekdays: number[]; // 0=Sunday … 6=Saturday
  sendWindowStart: string; // "09:00" local
  sendWindowEnd: string; // "20:00" local
}

interface LocalParts {
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function localParts(at: number, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    // "24" can appear for midnight in some ICU versions.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** True when `at` falls on an allowed weekday inside the local send window. */
export function isInWindow(at: number, cfg: WindowConfig): boolean {
  const local = localParts(at, cfg.timezone);
  if (!cfg.allowedWeekdays.includes(local.weekday)) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= parseHm(cfg.sendWindowStart) && minutes < parseHm(cfg.sendWindowEnd);
}

/**
 * The next timestamp at or after `at` inside the window. Walks forward in
 * 15-minute steps to the window edge (DST-safe because each step is
 * re-evaluated in local time), capped at 14 days.
 */
export function nextValidTime(at: number, cfg: WindowConfig): number {
  if (isInWindow(at, cfg)) return at;
  const STEP = 15 * 60 * 1000;
  const LIMIT = at + 14 * 24 * 60 * 60 * 1000;
  // Align to the next quarter hour so results are tidy.
  let t = Math.ceil(at / STEP) * STEP;
  while (t <= LIMIT) {
    if (isInWindow(t, cfg)) return t;
    t += STEP;
  }
  return LIMIT; // Degenerate config; callers treat this as "far future".
}

/** Today's local calendar day key in the given timezone (reads the clock;
 * kept out of React components so render stays pure). */
export function currentDayKey(timezone: string): string {
  return localDayKey(Date.now(), timezone);
}

/** Local calendar day key (YYYY-MM-DD) in the campaign timezone: used for
 * daily send counters. */
export function localDayKey(at: number, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(at));
}

export interface SpacingConfig {
  emailsPerBatch: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  interBatchDelayMinutes: number;
  dailySendLimit: number;
  pacingMode?: PacingMode;
}

/**
 * How the day's allowance is laid out across the sending window.
 *
 * SPREAD divides the window by the daily limit and sends on that interval
 * with jitter, so a hundred emails occupy eleven hours rather than the first
 * forty-eight minutes of them.
 *
 * BURST is the original behaviour: send as fast as the batch settings allow
 * until the daily cap stops you. It is kept because some senders genuinely
 * want a tight morning block, and because changing an existing campaign's
 * shape underneath its owner would be worse than letting them choose.
 */
export type PacingMode = "SPREAD" | "BURST";

/** Just the clock edges. Narrower than WindowConfig on purpose, so the pace
 * helpers below can be called from the wizard without inventing a timezone
 * and a weekday list they do not use. */
export interface WindowHours {
  sendWindowStart: string;
  sendWindowEnd: string;
}

/** Usable minutes between the window's open and close. */
export function windowMinutes(cfg: WindowHours): number {
  return Math.max(1, parseHm(cfg.sendWindowEnd) - parseHm(cfg.sendWindowStart));
}

/**
 * Average minutes between sends when the day's allowance is spread evenly
 * across the window. Shown in the wizard so the pace is a number a person
 * can sanity-check, not a shape they discover after launch.
 */
export function spreadIntervalMinutes(cfg: WindowHours & { dailySendLimit: number }): number {
  // Coerced because a non-finite limit here does not merely render wrong, it
  // throws: the interval becomes NaN, the cursor becomes NaN, and new Date(NaN)
  // raises RangeError in the middle of a launch.
  const perDay = Number(cfg.dailySendLimit);
  return windowMinutes(cfg) / Math.max(1, Number.isFinite(perDay) ? perDay : 1);
}

/** Sends per hour while the window is open. The number a spam filter sees. */
export function effectiveSendsPerHour(cfg: WindowHours & SpacingConfig): number {
  if ((cfg.pacingMode ?? "SPREAD") === "SPREAD") {
    return cfg.dailySendLimit / (windowMinutes(cfg) / 60);
  }
  // BURST: a batch takes (batch-1) short gaps plus one inter-batch gap.
  const avgGap = cfg.minDelaySeconds + Math.max(0, cfg.maxDelaySeconds - cfg.minDelaySeconds) / 2;
  const perBatchSeconds =
    Math.max(0, cfg.emailsPerBatch - 1) * avgGap + cfg.interBatchDelayMinutes * 60;
  if (perBatchSeconds <= 0) return cfg.dailySendLimit;
  return (cfg.emailsPerBatch * 3600) / perBatchSeconds;
}

/**
 * Precompute one randomized send timestamp per recipient.
 *
 * The shipped default used to put a full day's allowance out in forty-eight
 * minutes of an eleven-hour window, at roughly 125 an hour, and then go
 * silent. That is the exact shape the product's own guidance warns against,
 * and the pace-risk check could not see it because it only ever looked at
 * batch size and delays, never at how the volume landed across the day.
 * SPREAD sizes the gap from the window itself so the allowance fills it.
 */
export function computeSendTimestamps(
  startAt: number,
  count: number,
  cfg: WindowConfig & SpacingConfig,
  random: () => number = Math.random
): number[] {
  const out: number[] = [];
  const mode = cfg.pacingMode ?? "SPREAD";
  // Sized so exactly `dailySendLimit` sends fill the window. Running past the
  // close rolls to the next allowed day through nextValidTime, which is what
  // enforces the daily cap in this mode.
  const spreadBaseMs = spreadIntervalMinutes(cfg) * 60_000;

  let cursor = nextValidTime(startAt, cfg);
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      let gapMs: number;
      if (mode === "SPREAD") {
        // Jitter 0.6x to 1.4x. Enough that consecutive sends are not on a
        // metronome, bounded so the day still fits the window.
        gapMs = spreadBaseMs * (0.6 + random() * 0.8);
      } else {
        const endOfBatch = i % cfg.emailsPerBatch === 0;
        const gapSeconds = endOfBatch
          ? cfg.interBatchDelayMinutes * 60
          : cfg.minDelaySeconds +
            random() * Math.max(0, cfg.maxDelaySeconds - cfg.minDelaySeconds);
        gapMs = gapSeconds * 1000;
      }
      // Last line of defence before the cursor feeds Intl. A non-finite gap
      // would throw rather than schedule badly.
      cursor += Number.isFinite(gapMs) ? Math.round(gapMs) : 60_000;
    }
    cursor = nextValidTime(cursor, cfg);
    out.push(cursor);
  }
  return out;
}

export interface BusinessDayConfig {
  timezone: string;
  allowedWeekdays: number[];
}

/** Add N business days (days whose local weekday is allowed), preserving
 * time of day. */
export function addBusinessDays(at: number, days: number, cfg: BusinessDayConfig): number {
  const DAY = 24 * 60 * 60 * 1000;
  let t = at;
  let remaining = days;
  while (remaining > 0) {
    t += DAY;
    if (cfg.allowedWeekdays.includes(localParts(t, cfg.timezone).weekday)) {
      remaining--;
    }
  }
  return t;
}

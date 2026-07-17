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

/** Local calendar day key (YYYY-MM-DD) in the campaign timezone — used for
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
}

/**
 * Precompute one randomized send timestamp per recipient: batches of
 * `emailsPerBatch`, random per-email spacing, a longer gap between batches,
 * each timestamp rolled forward to the next valid window.
 */
export function computeSendTimestamps(
  startAt: number,
  count: number,
  cfg: WindowConfig & SpacingConfig,
  random: () => number = Math.random
): number[] {
  const out: number[] = [];
  let cursor = nextValidTime(startAt, cfg);
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const endOfBatch = i % cfg.emailsPerBatch === 0;
      const gapSeconds = endOfBatch
        ? cfg.interBatchDelayMinutes * 60
        : cfg.minDelaySeconds +
          random() * Math.max(0, cfg.maxDelaySeconds - cfg.minDelaySeconds);
      cursor += Math.round(gapSeconds * 1000);
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

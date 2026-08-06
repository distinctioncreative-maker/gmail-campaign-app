/**
 * Inbox warmup.
 *
 * A Gmail account connected five minutes ago could send a hundred cold emails
 * on its first day. Providers weight a sudden appearance of bulk mail from an
 * address with no sending history heavily, and it is the single fastest way a
 * new customer can burn their domain before the product has shown them
 * anything. `requiresWarmup` has existed in lib/tenancy/capabilities.ts since
 * the billing work and was wired to nothing.
 *
 * The ramp is a ceiling, never a floor: it only ever lowers the limit a
 * customer already chose. Pure, so it is testable and the same number appears
 * in the worker, the wizard, and the campaign page.
 */

export interface WarmupStage {
  /** Whole days since the inbox was connected, inclusive lower bound. */
  fromDay: number;
  /** Ceiling on sends per day while in this stage. */
  dailyCap: number;
}

/**
 * Roughly doubling each step over four weeks, which is the shape most
 * deliverability guidance converges on. The first stage is deliberately low
 * enough to be useless for a real campaign, because the point of week one is
 * to establish a pattern, not to get through a list.
 */
export const WARMUP_RAMP: readonly WarmupStage[] = [
  { fromDay: 0, dailyCap: 20 },
  { fromDay: 3, dailyCap: 40 },
  { fromDay: 7, dailyCap: 60 },
  { fromDay: 14, dailyCap: 100 },
  { fromDay: 21, dailyCap: 150 },
] as const;

/** Days after which no warmup ceiling applies. */
export const WARMUP_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WarmupState {
  /** True while the ramp still constrains this inbox. */
  active: boolean;
  dayNumber: number;
  /** Null once warmup is over. */
  dailyCap: number | null;
  daysRemaining: number;
  message: string | null;
}

/**
 * Where an inbox sits on the ramp.
 *
 * Anchored on when the inbox was connected rather than when it first sent.
 * That is a deliberate simplification with one known weakness: an inbox
 * connected a month ago and never used is treated as warm despite having no
 * sending history. Fixing it properly needs a lifetime send counter per
 * connection, which is a schema change and a write on the send path. Recorded
 * here rather than hidden, because the failure is in the lenient direction.
 */
export function warmupState(
  connectedAt: number | null | undefined,
  now: number = Date.now()
): WarmupState {
  const anchor = Number(connectedAt);
  // No connection, or a timestamp we cannot read: treat as brand new. A
  // warmup ceiling that is wrongly strict costs a customer some throughput;
  // one that is wrongly absent costs them their domain.
  if (!Number.isFinite(anchor) || anchor <= 0) {
    return {
      active: true,
      dayNumber: 0,
      dailyCap: WARMUP_RAMP[0].dailyCap,
      daysRemaining: WARMUP_DAYS,
      message: `New inbox: sending is capped at ${WARMUP_RAMP[0].dailyCap} a day while it builds a history.`,
    };
  }

  const dayNumber = Math.max(0, Math.floor((now - anchor) / DAY_MS));
  if (dayNumber >= WARMUP_DAYS) {
    return { active: false, dayNumber, dailyCap: null, daysRemaining: 0, message: null };
  }

  const stage = [...WARMUP_RAMP].reverse().find((s) => dayNumber >= s.fromDay) ?? WARMUP_RAMP[0];
  const daysRemaining = WARMUP_DAYS - dayNumber;
  return {
    active: true,
    dayNumber,
    dailyCap: stage.dailyCap,
    daysRemaining,
    message: `This inbox is ${dayNumber === 0 ? "new today" : `${dayNumber} day${dayNumber === 1 ? "" : "s"} old`}, so sending is capped at ${stage.dailyCap} a day while it builds a history. Full speed in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
  };
}

/**
 * The warmup ceiling as a plain number, for composing with the other caps.
 * Returns Infinity once warmup is over so callers can `Math.min` blindly.
 */
export function warmupDailyCap(
  connectedAt: number | null | undefined,
  now: number = Date.now()
): number {
  const state = warmupState(connectedAt, now);
  return state.dailyCap ?? Number.POSITIVE_INFINITY;
}

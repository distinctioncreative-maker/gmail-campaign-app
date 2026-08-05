import type { DealStatus } from "@/schemas/campaign";

/**
 * Deal-outcome arithmetic.
 *
 * The campaign document carries rolled-up counters so a report never has to
 * read every recipient. Keeping those counters correct is the whole problem
 * here, and it is not a matter of incrementing on write: a rep corrects a
 * deal value, moves a win to a loss, or clears a mis-click, and every one of
 * those has to unwind exactly what the previous state contributed.
 *
 * So nothing in this file increments. It computes the *difference* between
 * what a recipient used to contribute and what it contributes now, and the
 * caller applies that difference inside a transaction that read the prior
 * state. A wrong revenue number is worse than a missing one.
 *
 * Everything here is pure, so the cases that matter can be tested without a
 * database.
 */

/** What a recipient contributes to its campaign's counters. */
export interface OutcomeState {
  dealStatus: DealStatus | null;
  dealValueCents: number | null;
  /** Sticky: set the first time a meeting is reached and preserved through a
   * later loss, because a deal that was lost after a meeting still had one.
   * Only a full clear removes it. Without this the funnel would show fewer
   * meetings than wins, which is nonsense. */
  meetingBookedAt: number | null;
}

export interface OutcomeCounterDelta {
  meetingCount: number;
  wonCount: number;
  lostCount: number;
  wonValueCents: number;
}

const ZERO: OutcomeCounterDelta = {
  meetingCount: 0,
  wonCount: 0,
  lostCount: 0,
  wonValueCents: 0,
};

/** A win counts as having reached a meeting even if the rep never marked one
 * explicitly, because you do not close a deal you never spoke to. */
function reachesMeeting(status: DealStatus | null): boolean {
  return status === "MEETING_BOOKED" || status === "WON";
}

/**
 * Resolve what `meetingBookedAt` should be after a transition.
 *
 * - Reaching a meeting stamps it, keeping any earlier stamp so the timestamp
 *   records when the meeting happened rather than when it was last edited.
 * - A loss preserves an existing stamp but never creates one.
 * - Clearing the outcome removes it, so an accidental mark leaves no trace.
 */
export function nextMeetingBookedAt(
  prior: OutcomeState,
  nextStatus: DealStatus | null,
  now: number
): number | null {
  if (reachesMeeting(nextStatus)) return prior.meetingBookedAt ?? now;
  if (nextStatus === "LOST") return prior.meetingBookedAt;
  return null;
}

/** Money only counts while the deal is actually won. */
function wonValue(state: OutcomeState): number {
  return state.dealStatus === "WON" ? (state.dealValueCents ?? 0) : 0;
}

/**
 * The difference to apply to the campaign counters.
 *
 * Applying this to counters derived from `prior` yields counters consistent
 * with `next`, for every transition including the identity one.
 */
export function counterDelta(prior: OutcomeState, next: OutcomeState): OutcomeCounterDelta {
  const delta: OutcomeCounterDelta = {
    meetingCount:
      (next.meetingBookedAt !== null ? 1 : 0) - (prior.meetingBookedAt !== null ? 1 : 0),
    wonCount: (next.dealStatus === "WON" ? 1 : 0) - (prior.dealStatus === "WON" ? 1 : 0),
    lostCount: (next.dealStatus === "LOST" ? 1 : 0) - (prior.dealStatus === "LOST" ? 1 : 0),
    wonValueCents: wonValue(next) - wonValue(prior),
  };
  return delta;
}

/** True when a delta would change nothing, so the caller can skip the write. */
export function isNoopDelta(delta: OutcomeCounterDelta): boolean {
  return (
    delta.meetingCount === 0 &&
    delta.wonCount === 0 &&
    delta.lostCount === 0 &&
    delta.wonValueCents === 0
  );
}

/** Drop zero entries so a Firestore update only touches fields that moved. */
export function nonZeroCounters(delta: OutcomeCounterDelta): Partial<OutcomeCounterDelta> {
  const out: Partial<OutcomeCounterDelta> = {};
  for (const [key, value] of Object.entries(delta) as Array<
    [keyof OutcomeCounterDelta, number]
  >) {
    if (value !== 0) out[key] = value;
  }
  return out;
}

export const ZERO_DELTA = ZERO;

/**
 * Money in, money out. Values are stored in minor units so a deal never
 * drifts through floating point, and parsing happens once, here.
 *
 * Returns null for input that is not a usable amount, which the caller must
 * treat as "no value recorded" rather than as zero: a win with an unknown
 * value is a real thing, and a win worth nothing is not the same claim.
 */
export function parseDealValue(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  let raw: string | number;
  if (typeof input === "string") {
    raw = input.replace(/[^0-9.]/g, "");
    // Stripping "abc" or "$" leaves an empty string, and Number("") is 0.
    // Falling through would silently record a win worth nothing.
    if (raw === "") return null;
  } else {
    raw = input as number;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/** Display helper shared by the inbox, reports, and the demo fixtures. */
export function formatDealValue(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

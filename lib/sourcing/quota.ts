/**
 * Credit accounting for sourcing.
 *
 * Sourced leads are the only thing in the product with a real per-unit cost to
 * us: every row a vendor releases is billed. Everything else a customer does is
 * bounded by their own Gmail quota and costs us a Firestore write.
 *
 * That makes an unmetered search button a way for one workspace to spend money
 * without limit, which is not a hypothetical: a script hitting the search
 * endpoint in a loop is indistinguishable from enthusiasm until the invoice
 * arrives. So there is a monthly ceiling per workspace, checked before the
 * outbound call and decremented by what the vendor actually charged rather than
 * by what was displayed.
 *
 * Pure. The counter itself lives in Firestore; the arithmetic is here so the
 * cases that matter can be tested without one.
 */

/** Where a workspace starts. Deliberately small: enough to prove the feature is
 * useful, not enough to be worth abusing before anyone has paid for it. */
export const DEFAULT_MONTHLY_CREDITS = 250;

/** The most a single search may cost, whatever page size is asked for. A vendor
 * page of 500 is one request and 500 charges. */
export const MAX_CREDITS_PER_SEARCH = 50;

export interface CreditState {
  /** Calendar month key, e.g. "2026-08". Usage resets when this changes. */
  month: string;
  used: number;
  limit: number;
}

export function monthKey(now: number = Date.now()): string {
  const date = new Date(now);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/**
 * Read a stored counter as of now.
 *
 * A counter from a previous month reads as zero used rather than being rewritten,
 * so the reset costs no write and cannot half-apply. UTC months rather than the
 * workspace's timezone: a credit ceiling is a billing boundary, and a customer
 * with reps in two timezones should not get two different reset moments.
 */
export function creditsAvailable(state: CreditState, now: number = Date.now()): number {
  const limit = Math.max(0, Number(state.limit) || 0);
  if (state.month !== monthKey(now)) return limit;
  const used = Math.max(0, Number(state.used) || 0);
  return Math.max(0, limit - used);
}

export interface QuotaVerdict {
  allowed: boolean;
  /** How many rows this search may ask the vendor for. */
  grant: number;
  reason: string;
}

/**
 * How many rows a search may request.
 *
 * Grants less than asked for rather than refusing when the remaining balance is
 * short: a customer with 12 credits left should get 12 leads, not an error
 * telling them they cannot have 25.
 */
export function authorizeSearch(
  state: CreditState,
  requested: number,
  now: number = Date.now()
): QuotaVerdict {
  const available = creditsAvailable(state, now);
  const want = Math.max(0, Math.min(Math.floor(Number(requested) || 0), MAX_CREDITS_PER_SEARCH));

  if (want === 0) {
    return { allowed: false, grant: 0, reason: "Ask for at least one lead." };
  }
  if (available <= 0) {
    return {
      allowed: false,
      grant: 0,
      reason: `You have used this month's ${state.limit} sourcing credits. They reset at the start of next month.`,
    };
  }
  const grant = Math.min(want, available);
  return {
    allowed: true,
    grant,
    reason:
      grant < want
        ? `Only ${grant} sourcing credit${grant === 1 ? "" : "s"} left this month, so this search returns ${grant}.`
        : "",
  };
}

/** The counter after a search, given what the vendor actually charged. */
export function applyUsage(
  state: CreditState,
  creditsUsed: number,
  now: number = Date.now()
): CreditState {
  const month = monthKey(now);
  const charged = Math.max(0, Math.floor(Number(creditsUsed) || 0));
  // A month rollover starts from this search rather than adding to last month's
  // total, which is the whole reason the month key is stored beside the count.
  const priorUsed = state.month === month ? Math.max(0, Number(state.used) || 0) : 0;
  return { month, used: priorUsed + charged, limit: Math.max(0, Number(state.limit) || 0) };
}

export function describeCredits(state: CreditState, now: number = Date.now()): string {
  const available = creditsAvailable(state, now);
  if (available === 0) return "No sourcing credits left this month.";
  return `${available} of ${state.limit} sourcing credits left this month.`;
}

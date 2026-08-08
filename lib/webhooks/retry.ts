/**
 * When to retry a webhook delivery, and when to give up.
 *
 * Pure, because the interesting part is a set of judgements about someone
 * else's server rather than any I/O:
 *
 * **Which failures are worth retrying.** A 500 is the receiver having a bad
 * minute and will very likely succeed later. A 400 or a 422 is the receiver
 * saying the payload is wrong, and sending the identical payload again cannot
 * change that: retrying it is pure noise in their logs and ours. A 410 Gone is
 * an explicit "stop". The one that looks like a client error and is not is 429,
 * which means "later", so it retries.
 *
 * **How long to wait.** Exponential with jitter. Without jitter, a receiver
 * that goes down for five minutes gets every queued delivery from every
 * customer at the same instant it recovers, which is how a struggling server is
 * kept down.
 *
 * **When to stop trying.** After six attempts over roughly two hours. Retrying
 * for a day would keep a dead endpoint alive in the queue and deliver an event
 * so stale the receiver cannot act on it.
 */

export const MAX_ATTEMPTS = 6;

/**
 * Consecutive failed deliveries before a subscription turns itself off.
 *
 * A subscription nobody is maintaining otherwise keeps producing six attempts
 * per event forever: queue work, log noise, and a stream of requests at a server
 * whose owner has moved on. Twenty is high enough to ride out a long outage,
 * because turning off a working customer's webhook is far worse than a few extra
 * days of failed attempts.
 */
export const AUTO_DISABLE_AFTER_FAILURES = 20;

export function shouldDisableAfterFailures(consecutiveFailures: number): boolean {
  return consecutiveFailures >= AUTO_DISABLE_AFTER_FAILURES;
}

/** Base delays in milliseconds, before jitter. Roughly 30s to an hour. */
const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

export type DeliveryOutcome = "DELIVERED" | "RETRY" | "FAILED" | "DISABLED";

export interface AttemptResult {
  /** HTTP status, or null when the request never got one (DNS, timeout, reset). */
  status: number | null;
  attempt: number;
}

export interface RetryDecision {
  outcome: DeliveryOutcome;
  /** Milliseconds to wait before the next attempt. Zero when not retrying. */
  delayMs: number;
  reason: string;
}

/** 2xx is success. Anything else is judged below. */
export function isSuccess(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}

/**
 * Whether this status can plausibly succeed on a later identical attempt.
 *
 * A transport failure with no status at all is retryable: a DNS blip or a reset
 * connection says nothing about whether the payload is acceptable.
 */
export function isRetryable(status: number | null): boolean {
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  // 410 Gone is the receiver explicitly retiring the endpoint.
  if (status === 410) return false;
  if (status >= 400 && status < 500) return false;
  return status >= 500;
}

export function decideRetry(
  result: AttemptResult,
  random: () => number = Math.random
): RetryDecision {
  if (isSuccess(result.status)) {
    return { outcome: "DELIVERED", delayMs: 0, reason: "Delivered." };
  }
  if (result.status === 410) {
    // The receiver said the endpoint is gone. Continuing to post to it is both
    // useless and rude, so the subscription turns itself off.
    return {
      outcome: "DISABLED",
      delayMs: 0,
      reason: "Endpoint returned 410 Gone, so this subscription was disabled.",
    };
  }
  if (result.status !== null && result.status >= 300 && result.status < 400) {
    // Deliveries are sent with redirects disabled, so a 3xx arrives here as a
    // response rather than being followed. That is not a transport quirk to
    // retry around: the redirect target was never checked by
    // lib/webhooks/target.ts, and following it would hand a customer the
    // ability to aim our server anywhere by returning a Location header.
    return {
      outcome: "FAILED",
      delayMs: 0,
      reason: `Endpoint redirected with ${result.status}. Cadence does not follow redirects on deliveries, because the redirect target is never validated. Subscribe to the final URL instead.`,
    };
  }
  if (!isRetryable(result.status)) {
    return {
      outcome: "FAILED",
      delayMs: 0,
      reason: `Endpoint rejected the payload with ${result.status}. Retrying an identical payload cannot change that.`,
    };
  }
  if (result.attempt >= MAX_ATTEMPTS) {
    return {
      outcome: "FAILED",
      delayMs: 0,
      reason: `Gave up after ${MAX_ATTEMPTS} attempts. Later attempts would deliver an event too stale to act on.`,
    };
  }
  return {
    outcome: "RETRY",
    delayMs: backoffMs(result.attempt, random),
    reason: result.status === null ? "Could not reach the endpoint." : `Endpoint returned ${result.status}.`,
  };
}

/**
 * Delay before attempt N+1, jittered.
 *
 * Jitter is 50% to 100% of the base rather than a symmetric wobble: it only ever
 * spreads deliveries later, never earlier, so a recovering endpoint is not hit
 * sooner than the backoff intended.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1;
  const base = BACKOFF_MS[index];
  return Math.round(base * (0.5 + random() * 0.5));
}

/** One line for the deliveries list. */
export function describeAttempt(result: AttemptResult, decision: RetryDecision): string {
  const status = result.status === null ? "no response" : `HTTP ${result.status}`;
  if (decision.outcome === "DELIVERED") return `Attempt ${result.attempt}: ${status}, delivered.`;
  if (decision.outcome === "RETRY") {
    return `Attempt ${result.attempt}: ${status}, retrying in ${Math.round(decision.delayMs / 1000)}s.`;
  }
  return `Attempt ${result.attempt}: ${status}. ${decision.reason}`;
}

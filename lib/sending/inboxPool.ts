import { warmupDailyCap, warmupState } from "@/lib/campaigns/warmup";
import { assessBounces, type BounceGuardThresholds } from "@/lib/campaigns/bounceGuard";

/**
 * Which inbox sends the next email.
 *
 * One warmed Gmail account tops out near 150 real sends a day. That was the
 * hard ceiling on what any customer could achieve with Cadence, which made it
 * the ceiling on what Cadence could charge. Rotation lifts it by letting a
 * customer connect several inboxes and spreading the day's volume across them.
 *
 * The thing rotation must not become is a volume multiplier applied behind the
 * customer's back. Connecting a third inbox does not silently triple a
 * campaign's sending: the campaign's own daily limit and the plan cap still
 * bound the total. What rotation buys is the ability to *raise* that limit
 * without any single inbox exceeding a rate that would burn it.
 *
 * Everything here is pure. The selection rules decide which real mailbox a real
 * email leaves from, and getting one of them wrong looks like a customer's
 * follow-up arriving from a stranger's address, so they are testable in
 * isolation and tested exhaustively.
 */

export interface InboxCandidate {
  connectionId: string;
  connectedEmail: string;
  label: string;
  status: "CONNECTED" | "NEEDS_RECONNECT" | "REVOKED";
  paused: boolean;
  primary: boolean;
  /** When the inbox was connected, for the warmup ramp. */
  connectedAt: number;
  /** Total real sends ever, the other half of "is this warm". */
  lifetimeSends: number;
  /** Real sends already made from this inbox today. */
  sentToday: number;
  /** Lifetime real sends and bounces, for the per-inbox brake. */
  sentCount: number;
  bounceCount: number;
  /** Customer's own ceiling for this inbox, below every other ceiling. */
  dailyLimit: number | null;
}

export type InboxSkipReason =
  | "REVOKED"
  | "NEEDS_RECONNECT"
  | "PAUSED"
  | "BOUNCE_BRAKE"
  | "DAILY_CAP_REACHED"
  | "NOT_SELECTED_FOR_CAMPAIGN";

export interface InboxAssessment {
  candidate: InboxCandidate;
  usable: boolean;
  skipReason: InboxSkipReason | null;
  /** Ceiling for this inbox today: warmup, the customer's own limit, whichever is lower. */
  dailyCap: number;
  /** Sends still available from this inbox today. Never negative. */
  remaining: number;
  /** Human-readable, for the inbox list and diagnostics. */
  detail: string;
}

/**
 * Warmup for one inbox, using age *and* history.
 *
 * `warmupState` alone is anchored on the connection date, so an inbox connected
 * five weeks ago and never used reads as fully warm and could send 150 cold
 * emails on its genuine first day of activity. Requiring lifetime volume as
 * well is what makes the ramp mean what it says. The two are combined by taking
 * the stricter, because being wrongly cautious costs throughput while being
 * wrongly permissive costs a domain.
 */
export function inboxWarmupCap(candidate: Pick<InboxCandidate, "connectedAt" | "lifetimeSends">, now: number): number {
  const byAge = warmupDailyCap(candidate.connectedAt, now);
  // An inbox with almost no history is treated as being at the start of the
  // ramp however long ago it was connected. 150 is the ramp's final stage, so
  // anything at or above it has demonstrably sent at production volume.
  const history = Number(candidate.lifetimeSends) || 0;
  if (history >= 150) return byAge;
  const byHistory =
    history >= 100 ? 150 : history >= 40 ? 100 : history >= 15 ? 60 : history >= 5 ? 40 : 20;
  return Math.min(byAge, byHistory);
}

/** Whether an inbox may send right now, and how much it has left today. */
export function assessInbox(
  candidate: InboxCandidate,
  options: { now: number; thresholds: BounceGuardThresholds; allowed?: readonly string[] }
): InboxAssessment {
  const warmup = inboxWarmupCap(candidate, options.now);
  const own = candidate.dailyLimit === null ? Number.POSITIVE_INFINITY : candidate.dailyLimit;
  const dailyCap = Math.min(warmup, own);
  const sentToday = Math.max(0, Number(candidate.sentToday) || 0);
  const remaining = Number.isFinite(dailyCap) ? Math.max(0, dailyCap - sentToday) : Number.POSITIVE_INFINITY;

  const skip = (skipReason: InboxSkipReason, detail: string): InboxAssessment => ({
    candidate,
    usable: false,
    skipReason,
    dailyCap,
    remaining,
    detail,
  });

  // A campaign that names its senders means it. Falling back to an inbox the
  // customer did not choose would send their outreach from the wrong address,
  // which is worse than sending nothing.
  if (options.allowed && options.allowed.length > 0 && !options.allowed.includes(candidate.connectionId)) {
    return skip("NOT_SELECTED_FOR_CAMPAIGN", "Not one of this campaign's senders.");
  }
  if (candidate.status === "REVOKED") {
    return skip("REVOKED", "Disconnected. Reconnect it to send from this address again.");
  }
  if (candidate.status === "NEEDS_RECONNECT") {
    return skip("NEEDS_RECONNECT", "Google access expired. Reconnect to resume sending from here.");
  }
  if (candidate.paused) {
    return skip("PAUSED", "Paused by you. History and warmup progress are kept.");
  }

  // Per-inbox rather than per-campaign: the reputation a bounce rate spends is
  // the inbox's, so a bad list run from one address must not brake the others.
  const bounces = assessBounces(
    { sentCount: candidate.sentCount, bounceCount: candidate.bounceCount },
    options.thresholds
  );
  if (bounces.verdict === "STOP") {
    return skip("BOUNCE_BRAKE", `Paused automatically: ${bounces.message}`);
  }

  if (remaining <= 0) {
    return skip(
      "DAILY_CAP_REACHED",
      `Today's allowance is used (${sentToday} of ${dailyCap}). Resumes tomorrow.`
    );
  }

  const warmupNote = warmupState(candidate.connectedAt, options.now).active
    ? " Still warming up."
    : "";
  return {
    candidate,
    usable: true,
    skipReason: null,
    dailyCap,
    remaining,
    detail: `${remaining} of ${Number.isFinite(dailyCap) ? dailyCap : "unlimited"} left today.${warmupNote}`,
  };
}

export interface InboxSelection {
  chosen: InboxAssessment | null;
  /** Every inbox considered, in assessment order, for diagnostics and the UI. */
  assessments: InboxAssessment[];
  /** Why nothing was chosen, when nothing was. */
  blockedReason: InboxSkipReason | "NO_INBOXES" | null;
}

/**
 * Pick the next inbox.
 *
 * Least-used-today first. Spreading a day's volume evenly is the entire point:
 * filling one inbox to its ceiling before touching the next produces exactly
 * the spiky per-address pattern that rotation exists to avoid, and it would
 * make a three-inbox account behave like a one-inbox account until lunchtime.
 *
 * Ties break toward the primary inbox and then by connection id, so the choice
 * is deterministic. That matters more than it sounds: a non-deterministic pick
 * makes a bug here impossible to reproduce from a customer's report.
 */
export function selectInbox(
  candidates: readonly InboxCandidate[],
  options: { now: number; thresholds: BounceGuardThresholds; allowed?: readonly string[] }
): InboxSelection {
  const assessments = candidates.map((candidate) => assessInbox(candidate, options));
  if (assessments.length === 0) {
    return { chosen: null, assessments, blockedReason: "NO_INBOXES" };
  }

  const usable = assessments.filter((a) => a.usable);
  if (usable.length === 0) {
    // Report the most actionable reason rather than the first. A customer whose
    // inbox needs reconnecting can fix that; "daily cap reached" only tells
    // them to wait, so it should not mask the fixable one.
    const priority: InboxSkipReason[] = [
      "NEEDS_RECONNECT",
      "REVOKED",
      "BOUNCE_BRAKE",
      "NOT_SELECTED_FOR_CAMPAIGN",
      "PAUSED",
      "DAILY_CAP_REACHED",
    ];
    const reason =
      priority.find((r) => assessments.some((a) => a.skipReason === r)) ?? "DAILY_CAP_REACHED";
    return { chosen: null, assessments, blockedReason: reason };
  }

  const sorted = [...usable].sort(
    (a, b) =>
      a.candidate.sentToday - b.candidate.sentToday ||
      Number(b.candidate.primary) - Number(a.candidate.primary) ||
      a.candidate.connectionId.localeCompare(b.candidate.connectionId)
  );
  return { chosen: sorted[0], assessments, blockedReason: null };
}

/**
 * Total sends the pool can still make today.
 *
 * This is what makes a raised campaign limit honest. A customer setting 400 a
 * day across three warm inboxes is fine; the same 400 on one inbox is not, and
 * the wizard needs a number to say so with.
 */
export function poolCapacity(
  candidates: readonly InboxCandidate[],
  options: { now: number; thresholds: BounceGuardThresholds; allowed?: readonly string[] }
): { usableInboxes: number; remainingToday: number; dailyCeiling: number } {
  const assessments = candidates.map((c) => assessInbox(c, options));
  const usable = assessments.filter((a) => a.usable);
  const finite = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    usableInboxes: usable.length,
    remainingToday: usable.reduce((sum, a) => sum + finite(a.remaining), 0),
    dailyCeiling: usable.reduce((sum, a) => sum + finite(a.dailyCap), 0),
  };
}

/**
 * The inbox a follow-up must leave from.
 *
 * A threaded follow-up sent from a different address than the original is not a
 * follow-up: the recipient sees a stranger replying inside a conversation they
 * had with someone else, and Gmail will not thread it. So the original sender
 * wins over rotation, even when that inbox is busier or slower.
 *
 * If that inbox cannot send, the follow-up waits. Silently switching addresses
 * mid-thread would be a worse outcome than a delay, and it is not recoverable
 * once the mail has gone.
 */
export function inboxForFollowUp(
  candidates: readonly InboxCandidate[],
  originalConnectionId: string | null,
  options: { now: number; thresholds: BounceGuardThresholds }
): InboxSelection {
  if (!originalConnectionId) {
    // Nothing recorded: a campaign that predates rotation, so the single inbox
    // it used is whatever the pool resolves to now.
    return selectInbox(candidates, options);
  }
  const original = candidates.find((c) => c.connectionId === originalConnectionId);
  if (!original) {
    return {
      chosen: null,
      assessments: [],
      blockedReason: "REVOKED",
    };
  }
  return selectInbox([original], options);
}

/** One line per inbox for the settings list. */
export function describeInbox(assessment: InboxAssessment): string {
  const name = assessment.candidate.label || assessment.candidate.connectedEmail;
  return `${name}: ${assessment.detail}`;
}

/** The subset of a connection that decides which one is the default. */
export interface PrimaryCandidate {
  connectionId: string;
  primary: boolean;
  status: "CONNECTED" | "NEEDS_RECONNECT" | "REVOKED";
  createdAt: number;
}

/** The document id the single-connection era used for every connection. */
export const LEGACY_PRIMARY_ID = "primary";

/**
 * Settle which inbox is the default.
 *
 * Needed because `primary` did not exist when single-inbox connections were
 * written, so Zod fills it with `false` on parse and a pool where nothing is
 * primary has no defined fallback. Repairing it on read beats a migration
 * nobody remembers to run.
 *
 * Also enforces exactly one. Two primaries is as broken as none, and both are
 * reachable through concurrent connects, so it is settled here rather than
 * assumed. Pure, so the rule is testable without a database in the way.
 */
export function withResolvedPrimary<T extends PrimaryCandidate>(connections: readonly T[]): T[] {
  if (connections.length === 0) return [];
  const flagged = connections.filter((c) => c.primary);
  if (flagged.length === 1) return [...connections];

  const winner =
    flagged[0] ??
    connections.find((c) => c.connectionId === LEGACY_PRIMARY_ID) ??
    // Oldest connected inbox, else simply the oldest: the address someone has
    // been sending from longest is the least surprising default.
    [...connections].sort(
      (a, b) =>
        Number(b.status === "CONNECTED") - Number(a.status === "CONNECTED") ||
        a.createdAt - b.createdAt
    )[0];

  return connections.map((c) => ({ ...c, primary: c.connectionId === winner.connectionId }));
}

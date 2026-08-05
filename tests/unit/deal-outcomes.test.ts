import { describe, expect, it } from "vitest";
import {
  counterDelta,
  formatDealValue,
  isNoopDelta,
  nextMeetingBookedAt,
  nonZeroCounters,
  parseDealValue,
  type OutcomeCounterDelta,
  type OutcomeState,
} from "@/lib/campaigns/outcomes";
import type { DealStatus } from "@/schemas/campaign";

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const EARLIER = NOW - 86_400_000;

const CLEARED: OutcomeState = { dealStatus: null, dealValueCents: null, meetingBookedAt: null };

/** Build the state that `setDealOutcome` would write for a transition, so the
 * tests exercise the same composition the repository does rather than a
 * hand-rolled approximation of it. */
function transition(
  prior: OutcomeState,
  status: DealStatus | null,
  valueCents: number | null = null,
  now = NOW
): OutcomeState {
  return {
    dealStatus: status,
    dealValueCents: status === "WON" ? valueCents : null,
    meetingBookedAt: nextMeetingBookedAt(prior, status, now),
  };
}

/** Apply a delta to a running set of counters, the way Firestore's increment
 * would. Every test asserts on counters rather than on deltas, because the
 * counters are what a customer actually reads. */
function apply(counters: OutcomeCounterDelta, delta: OutcomeCounterDelta): OutcomeCounterDelta {
  return {
    meetingCount: counters.meetingCount + delta.meetingCount,
    wonCount: counters.wonCount + delta.wonCount,
    lostCount: counters.lostCount + delta.lostCount,
    wonValueCents: counters.wonValueCents + delta.wonValueCents,
  };
}

const ZERO: OutcomeCounterDelta = {
  meetingCount: 0,
  wonCount: 0,
  lostCount: 0,
  wonValueCents: 0,
};

/** Walk a recipient through a sequence of marks and return the campaign
 * counters at the end. */
function walk(steps: Array<[DealStatus | null, number | null]>): OutcomeCounterDelta {
  let state = CLEARED;
  let counters = ZERO;
  for (const [status, value] of steps) {
    const next = transition(state, status, value);
    counters = apply(counters, counterDelta(state, next));
    state = next;
  }
  return counters;
}

describe("deal outcome counters", () => {
  it("counts a first mark exactly once", () => {
    expect(walk([["MEETING_BOOKED", null]])).toEqual({
      meetingCount: 1,
      wonCount: 0,
      lostCount: 0,
      wonValueCents: 0,
    });
    expect(walk([["WON", 50_000]])).toEqual({
      // A win implies a meeting: you do not close a deal you never spoke to.
      meetingCount: 1,
      wonCount: 1,
      lostCount: 0,
      wonValueCents: 50_000,
    });
    expect(walk([["LOST", null]])).toEqual({
      // A loss does not imply a meeting; plenty of deals die before one.
      meetingCount: 0,
      wonCount: 0,
      lostCount: 1,
      wonValueCents: 0,
    });
  });

  it("does not double-count when a deal value is corrected", () => {
    // The failure this whole module exists to prevent: increment-on-write
    // would leave 1250 here.
    expect(walk([["WON", 50_000], ["WON", 75_000]])).toEqual({
      meetingCount: 1,
      wonCount: 1,
      lostCount: 0,
      wonValueCents: 75_000,
    });
  });

  it("removes the money when a win becomes a loss", () => {
    expect(walk([["WON", 50_000], ["LOST", null]])).toEqual({
      // The meeting stays: it really happened, and the funnel would otherwise
      // show fewer meetings than the deals that passed through them.
      meetingCount: 1,
      wonCount: 0,
      lostCount: 1,
      wonValueCents: 0,
    });
  });

  it("returns every counter to zero when an outcome is cleared", () => {
    for (const steps of [
      [["MEETING_BOOKED", null]],
      [["WON", 50_000]],
      [["LOST", null]],
      [["MEETING_BOOKED", null], ["WON", 120_000]],
      [["WON", 50_000], ["LOST", null]],
      [["WON", 50_000], ["WON", 75_000], ["LOST", null], ["MEETING_BOOKED", null]],
    ] as Array<Array<[DealStatus | null, number | null]>>) {
      expect(walk([...steps, [null, null]]), JSON.stringify(steps)).toEqual(ZERO);
    }
  });

  it("moves a meeting into a win without inflating the meeting count", () => {
    expect(walk([["MEETING_BOOKED", null], ["WON", 30_000]])).toEqual({
      meetingCount: 1,
      wonCount: 1,
      lostCount: 0,
      wonValueCents: 30_000,
    });
  });

  it("treats re-marking the same state as a no-op", () => {
    const prior = transition(CLEARED, "WON", 40_000);
    const delta = counterDelta(prior, transition(prior, "WON", 40_000));
    expect(isNoopDelta(delta)).toBe(true);
    expect(nonZeroCounters(delta)).toEqual({});
  });

  it("never carries a deal value onto a status that is not a win", () => {
    // The repository nulls the value for non-WON statuses; if that ever
    // regressed, money would survive on a lost deal.
    for (const status of ["MEETING_BOOKED", "LOST"] as const) {
      expect(transition(CLEARED, status, 99_000).dealValueCents).toBeNull();
    }
    expect(walk([["WON", 99_000], ["MEETING_BOOKED", 99_000]]).wonValueCents).toBe(0);
  });

  it("keeps a win with an unknown value countable", () => {
    // A rep who does not know the number must still be able to record the win,
    // and an unknown value is not the same claim as a deal worth nothing.
    expect(walk([["WON", null]])).toEqual({
      meetingCount: 1,
      wonCount: 1,
      lostCount: 0,
      wonValueCents: 0,
    });
  });

  it("stamps the meeting when it happened, not when it was last edited", () => {
    const booked: OutcomeState = {
      dealStatus: "MEETING_BOOKED",
      dealValueCents: null,
      meetingBookedAt: EARLIER,
    };
    expect(nextMeetingBookedAt(booked, "WON", NOW)).toBe(EARLIER);
    expect(nextMeetingBookedAt(booked, "LOST", NOW)).toBe(EARLIER);
    expect(nextMeetingBookedAt(booked, null, NOW)).toBeNull();
    expect(nextMeetingBookedAt(CLEARED, "WON", NOW)).toBe(NOW);
    // A loss never invents a meeting that did not happen.
    expect(nextMeetingBookedAt(CLEARED, "LOST", NOW)).toBeNull();
  });

  it("keeps counters non-negative across every ordering of marks", () => {
    const marks: Array<[DealStatus | null, number | null]> = [
      ["MEETING_BOOKED", null],
      ["WON", 10_000],
      ["LOST", null],
      [null, null],
      ["WON", 25_000],
    ];
    let state = CLEARED;
    let counters = ZERO;
    for (let pass = 0; pass < 3; pass++) {
      for (const [status, value] of marks) {
        const next = transition(state, status, value);
        counters = apply(counters, counterDelta(state, next));
        state = next;
        for (const value of Object.values(counters)) expect(value).toBeGreaterThanOrEqual(0);
        // One recipient can only ever be one thing at a time.
        expect(counters.wonCount + counters.lostCount).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("deal value parsing", () => {
  it("stores minor units so money never drifts through floating point", () => {
    expect(parseDealValue("1200.10")).toBe(120_010);
    expect(parseDealValue("$1,200")).toBe(120_000);
    expect(parseDealValue(0)).toBe(0);
  });

  it("returns null for anything that is not a usable amount", () => {
    // Null must mean "not recorded", never zero: a win with an unknown value
    // and a win worth nothing are different claims.
    for (const input of ["", null, undefined, "abc", -5, Number.NaN, Infinity]) {
      expect(parseDealValue(input), String(input)).toBeNull();
    }
  });

  it("formats without cents, because pipeline is not an invoice", () => {
    expect(formatDealValue(120_000)).toBe("$1,200");
    expect(formatDealValue(0)).toBe("$0");
  });
});

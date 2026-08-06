import { describe, expect, it } from "vitest";
import {
  WARMUP_DAYS,
  WARMUP_RAMP,
  warmupDailyCap,
  warmupState,
} from "@/lib/campaigns/warmup";

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => NOW - n * DAY;

describe("warmupState", () => {
  it("caps a brand-new inbox hard", () => {
    const state = warmupState(daysAgo(0), NOW);
    expect(state.active).toBe(true);
    expect(state.dailyCap).toBe(20);
    expect(state.message).toContain("20 a day");
  });

  it("climbs through every stage in order", () => {
    const caps = [0, 3, 7, 14, 21].map((d) => warmupState(daysAgo(d), NOW).dailyCap);
    expect(caps).toEqual([20, 40, 60, 100, 150]);
    // Monotone: a ramp that ever went down would be a bug, not a policy.
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]!).toBeGreaterThan(caps[i - 1]!);
    }
  });

  it("holds a stage until the next one starts", () => {
    expect(warmupState(daysAgo(2), NOW).dailyCap).toBe(20);
    expect(warmupState(daysAgo(6), NOW).dailyCap).toBe(40);
    expect(warmupState(daysAgo(13), NOW).dailyCap).toBe(60);
  });

  it("releases the inbox after the ramp", () => {
    const done = warmupState(daysAgo(WARMUP_DAYS), NOW);
    expect(done.active).toBe(false);
    expect(done.dailyCap).toBeNull();
    expect(done.message).toBeNull();
    expect(warmupDailyCap(daysAgo(WARMUP_DAYS), NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it("treats an unreadable or missing connection date as brand new", () => {
    // Wrongly strict costs throughput. Wrongly absent costs the domain.
    for (const input of [null, undefined, 0, Number.NaN, -1]) {
      const state = warmupState(input as number | null | undefined, NOW);
      expect(state.active).toBe(true);
      expect(state.dailyCap).toBe(WARMUP_RAMP[0].dailyCap);
    }
  });

  it("does not go backwards for a future timestamp", () => {
    const state = warmupState(NOW + 10 * DAY, NOW);
    expect(state.dayNumber).toBe(0);
    expect(state.dailyCap).toBe(20);
  });

  it("counts down the days remaining", () => {
    expect(warmupState(daysAgo(0), NOW).daysRemaining).toBe(WARMUP_DAYS);
    expect(warmupState(daysAgo(27), NOW).daysRemaining).toBe(1);
  });
});

describe("warmupDailyCap composition", () => {
  it("only ever lowers a limit, never raises one", () => {
    // The worker takes Math.min of the campaign limit, the plan cap, and this.
    const chosen = 500;
    for (const day of [0, 3, 7, 14, 21]) {
      expect(Math.min(chosen, warmupDailyCap(daysAgo(day), NOW))).toBeLessThan(chosen);
    }
    // A customer already sending less than the ramp allows is untouched.
    expect(Math.min(10, warmupDailyCap(daysAgo(0), NOW))).toBe(10);
  });
});

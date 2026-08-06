import { describe, expect, it } from "vitest";
import {
  assessBounces,
  clampThresholds,
  DEFAULT_BOUNCE_GUARD,
  MAX_BOUNCE_GUARD,
  shouldPause,
} from "@/lib/campaigns/bounceGuard";

describe("assessBounces", () => {
  it("says nothing until the sample is big enough to mean anything", () => {
    // One bounce in three is 33% and tells you nothing. Tripping here would
    // make the brake noise that customers learn to ignore.
    const early = assessBounces({ sentCount: 3, bounceCount: 1 });
    expect(early.verdict).toBe("OK");
    expect(early.message).toBeNull();
    expect(early.rate).toBeCloseTo(1 / 3, 2);
  });

  it("warns before it stops", () => {
    // 3% of 100: past the 2% warn line, short of the 5% stop line.
    const warn = assessBounces({ sentCount: 100, bounceCount: 3 });
    expect(warn.verdict).toBe("WARN");
    expect(shouldPause(warn)).toBe(false);
    expect(warn.message).toContain("3.0%");
  });

  it("stops a campaign bouncing at the danger rate", () => {
    const stop = assessBounces({ sentCount: 100, bounceCount: 6 });
    expect(stop.verdict).toBe("STOP");
    expect(shouldPause(stop)).toBe(true);
    expect(stop.message).toContain("6 of 100");
  });

  it("stays quiet for a healthy campaign", () => {
    const ok = assessBounces({ sentCount: 500, bounceCount: 2 });
    expect(ok.verdict).toBe("OK");
    expect(ok.message).toBeNull();
  });

  it("treats the thresholds as inclusive lower bounds", () => {
    expect(assessBounces({ sentCount: 100, bounceCount: 5 }).verdict).toBe("STOP");
    expect(assessBounces({ sentCount: 100, bounceCount: 2 }).verdict).toBe("WARN");
  });

  it("never divides by zero or trips on a counter that was never written", () => {
    // Same class as the funnel NaN: a campaign written before a counter
    // existed reads as undefined, and NaN compares false against every
    // threshold, which would silently disable the brake.
    for (const input of [
      { sentCount: 0, bounceCount: 0 },
      { sentCount: undefined as unknown as number, bounceCount: 5 },
      { sentCount: 100, bounceCount: undefined as unknown as number },
      { sentCount: Number.NaN, bounceCount: Number.NaN },
    ]) {
      const result = assessBounces(input);
      expect(Number.isFinite(result.rate)).toBe(true);
      expect(["OK", "WARN", "STOP"]).toContain(result.verdict);
    }
  });
});

describe("clampThresholds", () => {
  it("lets a customer tighten the brake", () => {
    const tight = clampThresholds({ warnRate: 0.005, stopRate: 0.01, minimumSends: 10 });
    expect(tight.stopRate).toBe(0.01);
    expect(tight.minimumSends).toBe(10);
  });

  it("refuses to let anyone loosen it past the ceiling", () => {
    // A brake a user can disable is not a safety feature, and the reputation
    // being spent is partly the platform's.
    const loose = clampThresholds({ warnRate: 0.9, stopRate: 0.9, minimumSends: 100_000 });
    expect(loose.stopRate).toBe(MAX_BOUNCE_GUARD.stopRate);
    expect(loose.warnRate).toBeLessThanOrEqual(MAX_BOUNCE_GUARD.warnRate);
    expect(loose.minimumSends).toBe(MAX_BOUNCE_GUARD.minimumSends);
  });

  it("never lets the warn line sit above the stop line", () => {
    const inverted = clampThresholds({ warnRate: 0.04, stopRate: 0.01 });
    expect(inverted.warnRate).toBeLessThanOrEqual(inverted.stopRate);
  });

  it("falls back to safe values for junk input", () => {
    const junk = clampThresholds({
      warnRate: Number.NaN,
      stopRate: Number.POSITIVE_INFINITY,
      minimumSends: -5,
    });
    expect(Number.isFinite(junk.warnRate)).toBe(true);
    expect(Number.isFinite(junk.stopRate)).toBe(true);
    expect(junk.minimumSends).toBeGreaterThan(0);
  });

  it("returns the defaults when given nothing", () => {
    expect(clampThresholds({})).toEqual(DEFAULT_BOUNCE_GUARD);
  });
});

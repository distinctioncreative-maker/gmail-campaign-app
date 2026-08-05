import { describe, expect, it } from "vitest";
import {
  assessPaceRisk,
  matchPreset,
  PACE_PRESETS,
  type PaceInput,
} from "@/lib/campaigns/paceSafety";

/** The batch fields only matter in BURST; SPREAD sizes gaps from the window. */
const BASE: PaceInput = {
  emailsPerBatch: 5,
  minDelaySeconds: 5,
  maxDelaySeconds: 10,
  interBatchDelayMinutes: 2,
  dailySendLimit: 80,
  sendWindowStart: "09:00",
  sendWindowEnd: "20:00",
  pacingMode: "SPREAD",
};

const pace = (over: Partial<PaceInput> = {}): PaceInput => ({ ...BASE, ...over });

describe("assessPaceRisk", () => {
  it("passes every shipped preset", () => {
    for (const preset of PACE_PRESETS) {
      const risk = assessPaceRisk(preset.schedule);
      expect(risk.risky, `${preset.label}: ${risk.reasons.join(" ")}`).toBe(false);
    }
  });

  it("catches the burst the old check could not see", () => {
    // The shipped default: 100 a day, batches of 5, two minutes apart. It put
    // the whole allowance out in 48 minutes at ~125 an hour and passed the
    // old three-knob check cleanly, because none of those knobs is a rate.
    const shipped = pace({
      pacingMode: "BURST",
      dailySendLimit: 100,
      emailsPerBatch: 5,
      minDelaySeconds: 5,
      maxDelaySeconds: 10,
      interBatchDelayMinutes: 2,
    });
    const risk = assessPaceRisk(shipped);
    expect(risk.risky).toBe(true);
    expect(Math.round(risk.sendsPerHour)).toBeGreaterThan(100);
    expect(risk.reasons.some((r) => r.includes("an hour"))).toBe(true);
  });

  it("reports the rate and interval a person can sanity-check", () => {
    // 80 across 11 hours is ~7.3/hour, about one every 8 minutes.
    const risk = assessPaceRisk(pace());
    expect(risk.sendsPerHour).toBeCloseTo(80 / 11, 1);
    expect(risk.intervalMinutes).toBeCloseTo(660 / 80, 1);
  });

  it("flags a daily limit above the safe range", () => {
    const risk = assessPaceRisk(pace({ dailySendLimit: 200 }));
    expect(risk.risky).toBe(true);
    expect(risk.reasons.some((r) => r.includes("a day"))).toBe(true);
  });

  it("flags a window too narrow to spread anything", () => {
    // Same daily volume, one hour to do it in. The limit alone looks fine.
    const risk = assessPaceRisk(pace({ sendWindowStart: "09:00", sendWindowEnd: "10:00" }));
    expect(risk.risky).toBe(true);
    expect(risk.reasons.some((r) => r.includes("window"))).toBe(true);
  });

  it("keeps the burst-specific warnings for anyone who opts into burst", () => {
    const risk = assessPaceRisk(
      pace({ pacingMode: "BURST", minDelaySeconds: 1, emailsPerBatch: 25 })
    );
    expect(risk.reasons.some((r) => r.includes("automated"))).toBe(true);
    expect(risk.reasons.some((r) => r.includes("spike"))).toBe(true);
  });

  it("never divides by zero on a degenerate window", () => {
    const risk = assessPaceRisk(pace({ sendWindowStart: "09:00", sendWindowEnd: "09:00" }));
    expect(Number.isFinite(risk.sendsPerHour)).toBe(true);
    expect(Number.isFinite(risk.intervalMinutes)).toBe(true);
  });
});

describe("matchPreset", () => {
  it("recognises each preset and returns null for a custom pace", () => {
    for (const preset of PACE_PRESETS) {
      expect(matchPreset(preset.schedule)).toBe(preset.id);
    }
    expect(matchPreset(pace({ dailySendLimit: 63 }))).toBeNull();
  });
});

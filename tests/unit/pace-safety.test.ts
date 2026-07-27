import { describe, expect, it } from "vitest";
import { assessPaceRisk } from "@/lib/campaigns/paceSafety";

describe("assessPaceRisk", () => {
  it("does not flag the app's own conservative/balanced defaults", () => {
    expect(assessPaceRisk({ emailsPerBatch: 3, minDelaySeconds: 10, dailySendLimit: 50 }).risky).toBe(false);
    expect(assessPaceRisk({ emailsPerBatch: 5, minDelaySeconds: 5, dailySendLimit: 100 }).risky).toBe(false);
  });

  it("flags a daily limit above the safe range", () => {
    const r = assessPaceRisk({ emailsPerBatch: 5, minDelaySeconds: 5, dailySendLimit: 200 });
    expect(r.risky).toBe(true);
    expect(r.reasons.some((x) => x.includes("a day"))).toBe(true);
  });

  it("flags a too-short minimum delay as automated-looking", () => {
    const r = assessPaceRisk({ emailsPerBatch: 5, minDelaySeconds: 1, dailySendLimit: 50 });
    expect(r.risky).toBe(true);
    expect(r.reasons.some((x) => x.includes("automated"))).toBe(true);
  });

  it("flags an oversized batch as a spike", () => {
    const r = assessPaceRisk({ emailsPerBatch: 25, minDelaySeconds: 5, dailySendLimit: 50 });
    expect(r.risky).toBe(true);
    expect(r.reasons.some((x) => x.includes("spike"))).toBe(true);
  });

  it("can flag multiple reasons at once", () => {
    const r = assessPaceRisk({ emailsPerBatch: 30, minDelaySeconds: 1, dailySendLimit: 500 });
    expect(r.reasons.length).toBe(3);
  });
});

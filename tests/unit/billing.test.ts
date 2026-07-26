import { describe, it, expect } from "vitest";
import { PLANS, isPlanId, defaultPlanFor, checkoutablePlans } from "@/lib/billing/plans";

describe("plan catalog", () => {
  it("recognizes valid plan ids only", () => {
    expect(isPlanId("TEAM")).toBe(true);
    expect(isPlanId("FREE")).toBe(true);
    expect(isPlanId("nope")).toBe(false);
    expect(isPlanId(null)).toBe(false);
  });

  it("defaults Solo to FREE and workspaces to TEAM (grandfathered full caps)", () => {
    expect(defaultPlanFor("CONSUMER")).toBe("FREE");
    expect(defaultPlanFor("WORKSPACE")).toBe("TEAM");
  });

  it("only Starter and Team are self-serve checkout plans, both with a price env", () => {
    const ids = checkoutablePlans().map((p) => p.id).sort();
    expect(ids).toEqual(["STARTER", "TEAM"]);
    for (const p of checkoutablePlans()) expect(p.stripePriceEnv).toBeTruthy();
  });

  it("send caps rise with tier and FREE matches the Solo ceiling", () => {
    expect(PLANS.FREE.maxDailySends).toBe(40);
    expect(PLANS.STARTER.maxDailySends).toBeGreaterThan(PLANS.FREE.maxDailySends);
    expect(PLANS.TEAM.maxDailySends).toBeGreaterThan(PLANS.STARTER.maxDailySends);
    expect(PLANS.TEAM.teams).toBe(true);
    expect(PLANS.FREE.teams).toBe(false);
  });
});

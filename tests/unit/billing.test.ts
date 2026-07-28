import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  PLANS,
  isPlanId,
  defaultPlanFor,
  checkoutablePlans,
  purchasedSeatLimit,
} from "@/lib/billing/plans";
import { resolveStripeSeatCount, verifyWebhook } from "@/lib/billing/stripe";

vi.mock("@/lib/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "whsec_unit_test",
  },
}));

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

  it("enforces purchased seats without constraining grandfathered workspaces", () => {
    expect(
      purchasedSeatLimit({
        plan: "TEAM",
        status: "active",
        stripeSubscriptionId: "sub_123",
        seats: 4,
      })
    ).toBe(4);
    expect(
      purchasedSeatLimit({
        plan: "TEAM",
        status: "none",
        stripeSubscriptionId: null,
        seats: 0,
      })
    ).toBeNull();
    expect(
      purchasedSeatLimit({
        plan: "FREE",
        status: "active",
        stripeSubscriptionId: "sub_123",
        seats: 1,
      })
    ).toBeNull();
  });
});

describe("Stripe webhook signatures", () => {
  const payload = JSON.stringify({
    id: "evt_123",
    type: "customer.subscription.updated",
    created: 1,
    data: { object: {} },
  });

  function signature(timestamp: number): string {
    return crypto
      .createHmac("sha256", "whsec_unit_test")
      .update(`${timestamp}.${payload}`)
      .digest("hex");
  }

  it("accepts any valid v1 signature during secret rotation", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(
      verifyWebhook(
        payload,
        `t=${timestamp},v1=${"0".repeat(64)},v1=${signature(timestamp)}`
      )
    ).toMatchObject({ id: "evt_123" });
  });

  it("rejects mismatched and stale signatures", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() =>
      verifyWebhook(payload, `t=${now},v1=${"0".repeat(64)}`)
    ).toThrow("Signature mismatch");

    const stale = now - 301;
    expect(() =>
      verifyWebhook(payload, `t=${stale},v1=${signature(stale)}`)
    ).toThrow("Timestamp outside tolerance");
  });
});

describe("Stripe seat quantities", () => {
  it("uses checkout metadata when line items are not expanded", () => {
    expect(resolveStripeSeatCount({}, { seats: "3" }, false)).toBe(3);
  });

  it("prefers current subscription quantity over stale checkout metadata", () => {
    expect(
      resolveStripeSeatCount(
        { items: { data: [{ quantity: 6 }] } },
        { seats: "3" },
        true
      )
    ).toBe(6);
  });
});

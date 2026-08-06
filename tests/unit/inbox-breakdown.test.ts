import { describe, expect, it } from "vitest";
import { buildInboxBreakdown } from "@/lib/analytics/report";

function row(over: Partial<Parameters<typeof buildInboxBreakdown>[0][number]> = {}) {
  return {
    connectionId: "c1",
    connectedEmail: "a@acme.com",
    label: "",
    status: "CONNECTED",
    sentCount: 100,
    bounceCount: 2,
    lifetimeSends: 100,
    ...over,
  };
}

describe("buildInboxBreakdown", () => {
  it("computes a per-inbox bounce rate", () => {
    const [only] = buildInboxBreakdown([row({ sentCount: 400, bounceCount: 8 })]);
    expect(only.bounceRate).toBeCloseTo(2, 5);
  });

  it("orders by volume so the inbox doing the work leads", () => {
    const rows = buildInboxBreakdown([
      row({ connectionId: "small", connectedEmail: "s@acme.com", sentCount: 10 }),
      row({ connectionId: "big", connectedEmail: "b@acme.com", sentCount: 900 }),
    ]);
    expect(rows.map((r) => r.connectionId)).toEqual(["big", "small"]);
  });

  it("breaks a volume tie deterministically", () => {
    const rows = buildInboxBreakdown([
      row({ connectionId: "z", connectedEmail: "z@acme.com" }),
      row({ connectionId: "a", connectedEmail: "a@acme.com" }),
    ]);
    expect(rows.map((r) => r.connectedEmail)).toEqual(["a@acme.com", "z@acme.com"]);
  });

  it("reports zero rather than dividing by zero for an unused inbox", () => {
    const [fresh] = buildInboxBreakdown([row({ sentCount: 0, bounceCount: 0 })]);
    expect(fresh.bounceRate).toBe(0);
    expect(Number.isFinite(fresh.bounceRate)).toBe(true);
  });

  it("coerces counters absent from a pre-rotation connection", () => {
    // The trap this codebase keeps hitting: a field added after documents exist
    // reads as undefined, and NaN here renders as "NaN%" on the page.
    const [legacy] = buildInboxBreakdown([
      row({
        sentCount: undefined as unknown as number,
        bounceCount: undefined as unknown as number,
        lifetimeSends: undefined as unknown as number,
      }),
    ]);
    expect(legacy.sent).toBe(0);
    expect(legacy.bounced).toBe(0);
    expect(legacy.lifetimeSends).toBe(0);
    expect(Number.isFinite(legacy.bounceRate)).toBe(true);
  });

  it("surfaces the one bad inbox in a pool that looks fine on average", () => {
    // The reason the panel exists: pooled 2.3% across these three, but one of
    // them is at 4% and is the one to act on.
    const rows = buildInboxBreakdown([
      row({ connectionId: "a", connectedEmail: "a@acme.com", sentCount: 1000, bounceCount: 10 }),
      row({ connectionId: "b", connectedEmail: "b@acme.com", sentCount: 1000, bounceCount: 12 }),
      row({ connectionId: "c", connectedEmail: "c@acme.com", sentCount: 500, bounceCount: 20 }),
    ]);
    const worst = rows.reduce((a, b) => (a.bounceRate > b.bounceRate ? a : b));
    expect(worst.connectionId).toBe("c");
    expect(worst.bounceRate).toBeCloseTo(4, 5);
  });

  it("is empty for an account with no inboxes", () => {
    expect(buildInboxBreakdown([])).toEqual([]);
  });
});

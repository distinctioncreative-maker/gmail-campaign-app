import { describe, expect, it } from "vitest";
import {
  RANGE_OPTIONS,
  buildFunnel,
  buildLeaderboard,
  resolveRangeDays,
  stringParam,
  sumTotals,
} from "@/lib/analytics/report";
import { CampaignSchema, type Campaign } from "@/schemas/campaign";

/** A valid Campaign with only the counters a test cares about overridden. */
function campaign(over: Partial<Campaign> = {}): Campaign {
  return CampaignSchema.parse({
    campaignId: over.campaignId ?? "c1",
    ownerUserId: "u1",
    organizationId: "o1",
    createdByUserId: "u1",
    name: over.name ?? "Campaign",
    status: over.status ?? "ACTIVE",
    schedule: {
      timezone: "America/New_York",
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
      allowedWeekdays: [1, 2, 3, 4, 5],
      dailySendLimit: 100,
    },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });
}

describe("stringParam", () => {
  it("takes the first value of a repeated query param", () => {
    expect(stringParam(["a", "b"])).toBe("a");
    expect(stringParam("a")).toBe("a");
    expect(stringParam(undefined)).toBe("");
    expect(stringParam([])).toBe("");
  });
});

describe("resolveRangeDays", () => {
  it("accepts the offered ranges", () => {
    for (const days of RANGE_OPTIONS) {
      expect(resolveRangeDays(String(days))).toBe(days);
    }
  });

  it("falls back to 30 for anything else", () => {
    for (const bad of [undefined, "", "7", "abc", "-90", "3650", "30.5"]) {
      expect(resolveRangeDays(bad)).toBe(30);
    }
  });
});

describe("sumTotals", () => {
  it("sums counters across every campaign in scope", () => {
    const t = sumTotals([
      campaign({
        campaignId: "a",
        sentCount: 100,
        followupSentCount: 40,
        replyCount: 9,
        bounceCount: 3,
        unsubscribeCount: 1,
        eligibleRecipients: 120,
        excludedRecipients: 30,
        meetingCount: 4,
        wonCount: 2,
        lostCount: 1,
        wonValueCents: 250_000,
      }),
      campaign({
        campaignId: "b",
        sentCount: 50,
        followupSentCount: 10,
        replyCount: 6,
        bounceCount: 1,
        unsubscribeCount: 0,
        eligibleRecipients: 60,
        excludedRecipients: 5,
        meetingCount: 3,
        wonCount: 1,
        lostCount: 2,
        wonValueCents: 90_000,
      }),
    ]);

    // Total sends counts follow-ups; initial does not.
    expect(t.sent).toBe(200);
    expect(t.initialSent).toBe(150);
    expect(t.followups).toBe(50);
    expect(t.replies).toBe(15);
    expect(t.bounces).toBe(4);
    expect(t.unsubscribes).toBe(1);
    expect(t.eligible).toBe(180);
    expect(t.excluded).toBe(35);
    expect(t.meetings).toBe(7);
    expect(t.won).toBe(3);
    expect(t.lost).toBe(3);
    expect(t.wonValueCents).toBe(340_000);
  });

  it("is all zeroes for an empty scope", () => {
    expect(sumTotals([])).toEqual({
      sent: 0,
      initialSent: 0,
      followups: 0,
      replies: 0,
      bounces: 0,
      unsubscribes: 0,
      eligible: 0,
      excluded: 0,
      meetings: 0,
      won: 0,
      lost: 0,
      wonValueCents: 0,
    });
  });
});

describe("buildFunnel", () => {
  it("reports each step against the one above it", () => {
    const steps = buildFunnel(
      sumTotals([
        campaign({
          sentCount: 50,
          followupSentCount: 20,
          replyCount: 5,
          eligibleRecipients: 200,
          excludedRecipients: 12,
        }),
      ])
    );

    expect(steps.map((s) => s.label)).toEqual([
      "Eligible leads",
      "Initial emails sent",
      "Replies",
    ]);
    expect(steps[0].value).toBe(200);
    expect(steps[0].detail).toContain("12 excluded");
    // 50 initial of 200 eligible. Follow-ups must not inflate this.
    expect(steps[1].value).toBe(50);
    expect(steps[1].detail).toContain("25.0%");
    // 5 replies of 50 contacted leads.
    expect(steps[2].value).toBe(5);
    expect(steps[2].detail).toContain("10.0%");
  });

  it("never produces a non-finite step value", () => {
    // A single undefined counter used to make sumTotals return NaN, which
    // Math.max then spread across every funnel bar as "NaN%". The browser
    // discarded the invalid width and rendered all five bars full, so the
    // chart confidently reported 100% at every stage. Nothing in the suite
    // caught it, because every assertion was on numbers that were fine.
    const partial = { ...campaign({ sentCount: 10, replyCount: 2 }) } as Record<string, unknown>;
    delete partial.meetingCount;
    const steps = buildFunnel(sumTotals([partial as never]));
    for (const step of steps) expect(Number.isFinite(step.value)).toBe(true);
  });

  it("stops at replies for a workspace that records no outcomes", () => {
    // Two permanent zeroes teach a new customer that the section is broken
    // rather than that it is empty.
    const steps = buildFunnel(
      sumTotals([campaign({ sentCount: 50, replyCount: 5, eligibleRecipients: 200 })])
    );
    expect(steps).toHaveLength(3);
  });

  it("extends to meetings and wins once outcomes exist", () => {
    const steps = buildFunnel(
      sumTotals([
        campaign({
          sentCount: 50,
          replyCount: 20,
          eligibleRecipients: 200,
          meetingCount: 8,
          wonCount: 3,
          lostCount: 4,
          wonValueCents: 500_000,
        }),
      ])
    );

    expect(steps.map((s) => s.label)).toEqual([
      "Eligible leads",
      "Initial emails sent",
      "Replies",
      "Meetings",
      "Won",
    ]);
    // 8 meetings of 20 replies.
    expect(steps[3].value).toBe(8);
    expect(steps[3].detail).toContain("40.0%");
    // 3 wins of 8 meetings: each step is measured against the one above it,
    // not against the top of the funnel.
    expect(steps[4].value).toBe(3);
    expect(steps[4].detail).toContain("37.5%");
  });

  it("never divides by zero and never exceeds 100%", () => {
    const empty = buildFunnel(sumTotals([]));
    expect(empty[1].detail).toBe("No eligible leads yet");
    expect(empty[2].detail).toBe("No initial sends yet");

    // Sends can outrun the eligible count when leads are added mid-campaign.
    const over = buildFunnel(
      sumTotals([campaign({ sentCount: 300, eligibleRecipients: 100 })])
    );
    expect(over[1].detail).toContain("100.0%");
  });
});

describe("buildLeaderboard", () => {
  it("drops campaigns with no sends and ranks by reply rate", () => {
    const rows = buildLeaderboard([
      campaign({ campaignId: "never-sent", name: "Never sent", sentCount: 0 }),
      campaign({ campaignId: "low", name: "Low", sentCount: 100, replyCount: 2 }),
      campaign({ campaignId: "high", name: "High", sentCount: 100, replyCount: 20 }),
    ]);

    expect(rows.map((r) => r.campaign.campaignId)).toEqual(["high", "low"]);
    expect(rows[0].performance.replyRate).toBeCloseTo(20);
  });

  it("breaks a reply-rate tie by volume, so the bigger proof point wins", () => {
    const rows = buildLeaderboard([
      campaign({ campaignId: "small", sentCount: 10, replyCount: 1 }),
      campaign({ campaignId: "large", sentCount: 500, replyCount: 50 }),
    ]);
    expect(rows.map((r) => r.campaign.campaignId)).toEqual(["large", "small"]);
  });

  it("counts follow-ups in the sends a campaign is ranked on", () => {
    const [row] = buildLeaderboard([
      campaign({ sentCount: 0, followupSentCount: 40, replyCount: 4 }),
    ]);
    expect(row.performance.sent).toBe(40);
    expect(row.performance.replyRate).toBeCloseTo(10);
  });
});

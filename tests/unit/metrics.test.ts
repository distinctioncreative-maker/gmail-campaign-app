import { describe, expect, it } from "vitest";
import {
  totals,
  timeToReply,
  replyHeatmap,
  bestSendTimes,
  dailyTrend,
  formatDuration,
  totalSent,
  replyRateForCampaign,
  campaignPerformance,
  recipientsSentSince,
  reportWindow,
  openClickRates,
  type RecipientPoint,
} from "@/lib/analytics/metrics";

const TZ = "America/New_York";
const p = (o: Partial<RecipientPoint>): RecipientPoint => ({
  initialSentAt: null,
  repliedAt: null,
  bouncedAt: null,
  unsubscribedAt: null,
  ...o,
});

describe("totals", () => {
  it("computes counts and rates off sent", () => {
    const t = totals([
      p({ initialSentAt: 1, repliedAt: 2 }),
      p({ initialSentAt: 1 }),
      p({ initialSentAt: 1, bouncedAt: 3 }),
      p({}), // never sent — ignored in rates
    ]);
    expect(t.sent).toBe(3);
    expect(t.replied).toBe(1);
    expect(t.bounced).toBe(1);
    expect(t.replyRate).toBeCloseTo(33.33, 1);
    expect(t.bounceRate).toBeCloseTo(33.33, 1);
  });
});

describe("openClickRates", () => {
  it("rates opens and clicks against sent, not against every point", () => {
    const r = openClickRates([
      p({ initialSentAt: 1, openedAt: 2, firstClickedAt: 3 }),
      p({ initialSentAt: 1, openedAt: 2 }),
      p({ initialSentAt: 1 }),
      p({ initialSentAt: 1 }),
      p({}), // never sent — excluded from the denominator entirely
    ]);
    expect(r.sent).toBe(4);
    expect(r.opened).toBe(2);
    expect(r.clicked).toBe(1);
    expect(r.openRate).toBeCloseTo(50, 5);
    expect(r.clickRate).toBeCloseTo(25, 5);
  });

  it("returns all zeros when nothing has sent", () => {
    const r = openClickRates([p({}), p({})]);
    expect(r).toEqual({ sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 });
  });
});

describe("timeToReply", () => {
  it("computes average, median, and buckets", () => {
    const hour = 3600_000;
    const day = 24 * hour;
    const r = timeToReply([
      p({ initialSentAt: 0, repliedAt: 30 * 60_000 }), // 30m → under1h
      p({ initialSentAt: 0, repliedAt: 5 * hour }), // 5h → under1d
      p({ initialSentAt: 0, repliedAt: 2 * day }), // 2d → under3d
      p({ initialSentAt: 0, repliedAt: 10 * day }), // 10d → later
      p({ initialSentAt: 5, repliedAt: 1 }), // reply before send → excluded
    ]);
    expect(r.count).toBe(4);
    expect(r.buckets).toEqual({ under1h: 1, under1d: 1, under3d: 1, later: 1 });
    expect(r.medianMs).toBeGreaterThan(0);
  });

  it("handles no replies", () => {
    const r = timeToReply([p({ initialSentAt: 0 })]);
    expect(r.count).toBe(0);
    expect(r.averageMs).toBeNull();
  });
});

describe("replyHeatmap", () => {
  it("returns a 7x24 grid and counts a reply", () => {
    const grid = replyHeatmap([p({ initialSentAt: 0, repliedAt: Date.parse("2026-07-15T14:00:00-04:00") })], TZ);
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("bestSendTimes", () => {
  it("groups reply rate by send hour", () => {
    const at9 = Date.parse("2026-07-15T09:00:00-04:00");
    const rows = bestSendTimes(
      [
        p({ initialSentAt: at9, repliedAt: at9 + 3600_000 }),
        p({ initialSentAt: at9 }),
      ],
      TZ
    );
    const nine = rows.find((r) => r.hour === 9);
    expect(nine?.sent).toBe(2);
    expect(nine?.replied).toBe(1);
    expect(nine?.rate).toBeCloseTo(50, 1);
  });
});

describe("dailyTrend", () => {
  it("returns `days` ordered rows and buckets a send on today", () => {
    const now = Date.parse("2026-07-20T12:00:00-04:00");
    const rows = dailyTrend([p({ initialSentAt: now, repliedAt: now })], TZ, 7, now);
    expect(rows).toHaveLength(7);
    expect(rows[rows.length - 1].sent).toBe(1);
    expect(rows[rows.length - 1].replied).toBe(1);
  });
});

describe("totalSent", () => {
  it("is initial sends plus follow-ups — the one 'emails sent' definition for the whole app", () => {
    expect(totalSent({ sentCount: 280, followupSentCount: 214 })).toBe(494);
    expect(totalSent({ sentCount: 0, followupSentCount: 0 })).toBe(0);
  });
});

describe("replyRateForCampaign", () => {
  it("divides replies by the combined sent total, not initial sends alone", () => {
    // Regression guard: a campaign with more follow-up sends than initial
    // sends must not report a reply rate above 100% or diverge from the
    // Home/Reports leaderboard definition of "sent".
    expect(replyRateForCampaign({ sentCount: 280, followupSentCount: 214, replyCount: 4 })).toBeCloseTo(
      (4 / 494) * 100,
      5
    );
  });

  it("returns 0 rather than dividing by zero when nothing has sent", () => {
    expect(replyRateForCampaign({ sentCount: 0, followupSentCount: 0, replyCount: 0 })).toBe(0);
  });
});

describe("campaignPerformance", () => {
  it("keeps progress based on initial sends while rates use every send", () => {
    const result = campaignPerformance({
      eligibleRecipients: 100,
      sentCount: 80,
      followupSentCount: 40,
      replyCount: 12,
      bounceCount: 3,
      unsubscribeCount: 1,
    });

    expect(result.sent).toBe(120);
    expect(result.progressRate).toBe(80);
    expect(result.replyRate).toBe(10);
    expect(result.bounceRate).toBe(2.5);
    expect(result.unsubscribeRate).toBeCloseTo(0.833, 2);
  });

  it("does not divide by zero or exceed 100% progress", () => {
    expect(
      campaignPerformance({
        eligibleRecipients: 0,
        sentCount: 0,
        followupSentCount: 0,
        replyCount: 0,
        bounceCount: 0,
        unsubscribeCount: 0,
      })
    ).toEqual({
      sent: 0,
      progressRate: 0,
      replyRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0,
    });

    expect(
      campaignPerformance({
        eligibleRecipients: 10,
        sentCount: 11,
        followupSentCount: 0,
        replyCount: 0,
        bounceCount: 0,
        unsubscribeCount: 0,
      }).progressRate
    ).toBe(100);
  });
});

describe("recipientsSentSince", () => {
  it("keeps only recipients whose initial send belongs to the selected cohort", () => {
    const since = 100;
    expect(
      recipientsSentSince(
        [
          p({ initialSentAt: 99 }),
          p({ initialSentAt: 100 }),
          p({ initialSentAt: 101 }),
          p({ initialSentAt: null, repliedAt: 200 }),
        ],
        since
      )
    ).toEqual([
      p({ initialSentAt: 100 }),
      p({ initialSentAt: 101 }),
    ]);
  });
});

describe("reportWindow", () => {
  it("returns a stable lookback boundary from an injected clock", () => {
    const now = 10 * 24 * 3600_000;
    expect(reportWindow(3, now)).toEqual({
      since: 7 * 24 * 3600_000,
      now,
    });
  });
});

describe("formatDuration", () => {
  it("formats minutes, hours, days", () => {
    expect(formatDuration(null)).toBe("Not available");
    expect(formatDuration(30 * 60_000)).toBe("30m");
    expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe("2h 15m");
    expect(formatDuration(3 * 24 * 3600_000)).toBe("3d");
  });
});

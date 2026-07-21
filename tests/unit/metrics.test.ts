import { describe, expect, it } from "vitest";
import {
  totals,
  timeToReply,
  replyHeatmap,
  bestSendTimes,
  dailyTrend,
  formatDuration,
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

describe("formatDuration", () => {
  it("formats minutes, hours, days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(30 * 60_000)).toBe("30m");
    expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe("2h 15m");
    expect(formatDuration(3 * 24 * 3600_000)).toBe("3d");
  });
});

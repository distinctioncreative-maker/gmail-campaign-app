import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  computeSendTimestamps,
  isInWindow,
  localDayKey,
  nextValidTime,
} from "@/lib/scheduling/window";

// Base config: weekdays 9:00–20:00 Eastern.
const CFG = {
  timezone: "America/New_York",
  allowedWeekdays: [1, 2, 3, 4, 5],
  sendWindowStart: "09:00",
  sendWindowEnd: "20:00",
};

// Wed 2026-07-15 (EDT, UTC-4).
function eastern(h: number, m = 0, day = 15): number {
  return Date.UTC(2026, 6, day, h + 4, m);
}

describe("isInWindow", () => {
  it("accepts a weekday inside the window", () => {
    expect(isInWindow(eastern(10), CFG)).toBe(true);
  });
  it("rejects before 9 AM and at/after 8 PM local", () => {
    expect(isInWindow(eastern(8, 59), CFG)).toBe(false);
    expect(isInWindow(eastern(20, 0), CFG)).toBe(false);
    expect(isInWindow(eastern(19, 59), CFG)).toBe(true);
  });
  it("rejects weekends", () => {
    // 2026-07-18 is a Saturday.
    expect(isInWindow(eastern(12, 0, 18), CFG)).toBe(false);
  });
});

describe("nextValidTime (rollovers)", () => {
  it("8 PM rollover: schedules next morning at/after 9 AM", () => {
    const next = nextValidTime(eastern(20, 5), CFG);
    expect(isInWindow(next, CFG)).toBe(true);
    // Next day (Thu) 9:00 EDT = 13:00 UTC.
    expect(next).toBeGreaterThanOrEqual(eastern(9, 0, 16));
    expect(next).toBeLessThan(eastern(10, 0, 16));
  });

  it("weekend rollover: Friday night rolls to Monday morning", () => {
    // Fri 2026-07-17 21:00 → Mon 2026-07-20 ~9:00.
    const next = nextValidTime(eastern(21, 0, 17), CFG);
    expect(isInWindow(next, CFG)).toBe(true);
    expect(next).toBeGreaterThanOrEqual(eastern(9, 0, 20));
    expect(next).toBeLessThan(eastern(10, 0, 20));
  });

  it("returns the input when already valid", () => {
    const t = eastern(11, 30);
    expect(nextValidTime(t, CFG)).toBe(t);
  });
});

describe("localDayKey", () => {
  it("uses the campaign timezone's calendar day", () => {
    // 2026-07-16 01:00 UTC is still 2026-07-15 in New York.
    expect(localDayKey(Date.UTC(2026, 6, 16, 1), "America/New_York")).toBe("2026-07-15");
  });
});

describe("computeSendTimestamps", () => {
  const spacing = {
    ...CFG,
    emailsPerBatch: 5,
    minDelaySeconds: 5,
    maxDelaySeconds: 10,
    interBatchDelayMinutes: 2,
  };

  it("spaces emails 5–10s apart within a batch and ~2min between batches", () => {
    const times = computeSendTimestamps(eastern(10), 7, spacing, () => 0.5);
    for (let i = 1; i < 5; i++) {
      const gap = (times[i] - times[i - 1]) / 1000;
      expect(gap).toBeGreaterThanOrEqual(5);
      expect(gap).toBeLessThanOrEqual(10);
    }
    const batchGap = (times[5] - times[4]) / 1000;
    expect(batchGap).toBeGreaterThanOrEqual(120);
    expect((times[6] - times[5]) / 1000).toBeGreaterThanOrEqual(5);
  });

  it("all timestamps land inside the window even when started late evening", () => {
    const times = computeSendTimestamps(eastern(19, 59), 10, spacing);
    for (const t of times) expect(isInWindow(t, CFG)).toBe(true);
  });

  it("timestamps are monotonically increasing", () => {
    const times = computeSendTimestamps(eastern(10), 20, spacing);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Fri 2026-07-17 + 2 business days = Tue 2026-07-21.
    const result = addBusinessDays(eastern(10, 0, 17), 2, CFG);
    expect(localDayKey(result, CFG.timezone)).toBe("2026-07-21");
  });
});

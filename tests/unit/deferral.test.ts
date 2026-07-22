import { describe, expect, it } from "vitest";
import { nextDayWindowStart } from "@/lib/campaigns/deferral";
import { computeSendTimestamps, localDayKey } from "@/lib/scheduling/window";

const schedule = {
  timezone: "America/New_York",
  allowedWeekdays: [1, 2, 3, 4, 5],
  startAt: null,
  dailySendLimit: 100,
  sendWindowStart: "09:00",
  sendWindowEnd: "17:00",
  emailsPerBatch: 5,
  minDelaySeconds: 30,
  maxDelaySeconds: 90,
  interBatchDelayMinutes: 2,
};

// Tue Jul 21 2026 14:16 UTC = 10:16 AM in New York (EDT).
const TUE_MORNING = Date.UTC(2026, 6, 21, 14, 16);

describe("nextDayWindowStart", () => {
  it("lands on the NEXT calendar day, never later today", () => {
    const start = nextDayWindowStart(TUE_MORNING, schedule);
    expect(localDayKey(start, schedule.timezone)).toBe("2026-07-22");
    expect(start).toBeGreaterThan(TUE_MORNING);
  });

  it("skips disallowed weekdays (Friday defers to Monday)", () => {
    // Fri Jul 24 2026 15:00 UTC = 11:00 AM New York.
    const friday = Date.UTC(2026, 6, 24, 15, 0);
    const start = nextDayWindowStart(friday, schedule);
    expect(localDayKey(start, schedule.timezone)).toBe("2026-07-27"); // Monday
  });
});

describe("re-spread pacing (regression for the 9:00 AM stampede)", () => {
  it("gives every deferred email a distinct, paced timestamp", () => {
    const start = nextDayWindowStart(TUE_MORNING, schedule);
    const times = computeSendTimestamps(start, 90, schedule, () => 0.5);
    // Strictly increasing — nothing fires at the same instant.
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(30_000);
    }
    // Batch boundaries get the long gap, so 90 emails span well over an hour
    // instead of one minute.
    expect(times[89] - times[0]).toBeGreaterThan(60 * 60 * 1000);
  });
});

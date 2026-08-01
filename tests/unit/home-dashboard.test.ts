import { describe, expect, it } from "vitest";
import {
  bestCampaign,
  buildSetupSteps,
  greetingFor,
  hasEverLaunched,
  statsForRange,
} from "@/lib/home/dashboard";
import { CampaignSchema, type Campaign } from "@/schemas/campaign";

function campaign(over: Partial<Campaign> = {}): Campaign {
  return CampaignSchema.parse({
    campaignId: over.campaignId ?? "c1",
    ownerUserId: "u1",
    organizationId: "o1",
    createdByUserId: "u1",
    name: over.name ?? "Campaign",
    status: over.status ?? "DRAFT",
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

describe("buildSetupSteps", () => {
  it("marks nothing done for a brand new account", () => {
    const steps = buildSetupSteps({
      gmailConnected: false,
      totalLeads: 0,
      templateCount: 0,
      hasLaunched: false,
    });
    expect(steps).toHaveLength(4);
    expect(steps.every((s) => !s.done)).toBe(true);
    // Gmail is first because nothing else can happen without it.
    expect(steps[0].href).toBe("/settings");
  });

  it("marks each step done from real data, independently", () => {
    const steps = buildSetupSteps({
      gmailConnected: true,
      totalLeads: 12,
      templateCount: 0,
      hasLaunched: false,
    });
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
  });
});

describe("hasEverLaunched", () => {
  it("is false for drafts and for a ready campaign that never sent", () => {
    expect(hasEverLaunched([])).toBe(false);
    expect(hasEverLaunched([campaign({ status: "DRAFT" })])).toBe(false);
    expect(hasEverLaunched([campaign({ status: "READY", sentCount: 0 })])).toBe(false);
  });

  it("is true once a campaign has sent or has ever run", () => {
    expect(hasEverLaunched([campaign({ status: "DRAFT", sentCount: 1 })])).toBe(true);
    for (const status of ["ACTIVE", "PAUSED", "COMPLETED", "STOPPED"] as const) {
      expect(hasEverLaunched([campaign({ status })]), status).toBe(true);
    }
  });
});

describe("statsForRange", () => {
  const buckets = {
    today: { sent: 10, replies: 1 },
    week: { sent: 100, replies: 15 },
    all: { sent: 1000, replies: 90 },
  };

  it("selects the right bucket and labels it", () => {
    expect(statsForRange("today", buckets)).toMatchObject({ sent: 10, label: "today" });
    expect(statsForRange("7d", buckets)).toMatchObject({ sent: 100, label: "last 7 days" });
    expect(statsForRange("all", buckets)).toMatchObject({ sent: 1000, label: "all time" });
  });

  it("computes the reply rate off that bucket, not the all-time totals", () => {
    expect(statsForRange("7d", buckets).replyRate).toBeCloseTo(15);
    expect(statsForRange("all", buckets).replyRate).toBeCloseTo(9);
  });

  it("returns 0 rather than dividing by zero when nothing was sent", () => {
    const rate = statsForRange("today", {
      ...buckets,
      today: { sent: 0, replies: 0 },
    }).replyRate;
    expect(rate).toBe(0);
    expect(Number.isFinite(rate)).toBe(true);
  });
});

describe("bestCampaign", () => {
  it("ignores campaigns too small to be meaningful", () => {
    // 1 reply out of 2 sends is 50%, but it proves nothing.
    const best = bestCampaign([
      campaign({ campaignId: "tiny", sentCount: 2, replyCount: 1 }),
      campaign({ campaignId: "real", sentCount: 200, replyCount: 20 }),
    ]);
    expect(best?.c.campaignId).toBe("real");
  });

  it("is null when no campaign clears the sample threshold", () => {
    expect(bestCampaign([])).toBeNull();
    expect(bestCampaign([campaign({ sentCount: 4, replyCount: 4 })])).toBeNull();
  });

  it("counts follow-ups toward the sample size", () => {
    const best = bestCampaign([
      campaign({ campaignId: "followups", sentCount: 2, followupSentCount: 8, replyCount: 1 }),
    ]);
    expect(best?.c.campaignId).toBe("followups");
  });
});

describe("greetingFor", () => {
  it("greets by the user's own timezone, not the server's", () => {
    const greetings = ["Good morning", "Good afternoon", "Good evening"];
    // Two zones far enough apart that they cannot always agree.
    expect(greetings).toContain(greetingFor("Pacific/Auckland"));
    expect(greetings).toContain(greetingFor("America/Los_Angeles"));
  });
});

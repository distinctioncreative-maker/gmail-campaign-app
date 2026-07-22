import { describe, expect, it } from "vitest";
import { buildBriefing, type BriefingInput } from "@/lib/home/briefing";

function base(over: Partial<BriefingInput> = {}): BriefingInput {
  return {
    gmailConnected: true,
    activeCampaigns: 0,
    unreadReplies: 0,
    repliesThisWeek: 0,
    sentThisWeek: 0,
    totalLeads: 100,
    hasCampaigns: true,
    ...over,
  };
}

describe("buildBriefing", () => {
  it("prioritizes Gmail setup when disconnected", () => {
    const b = buildBriefing(base({ gmailConnected: false }));
    expect(b.status).toBe("SETUP");
    expect(b.suggestions[0].label).toBe("Connect Gmail");
  });

  it("composes a natural sentence from active work", () => {
    const b = buildBriefing(base({ activeCampaigns: 4, unreadReplies: 3, sentThisWeek: 127 }));
    expect(b.sentence).toBe(
      "4 campaigns are sending right now, 3 new replies are waiting, and 127 emails went out this week."
    );
    expect(b.status).toBe("REPLIES");
    expect(b.suggestions[0].href).toBe("/replies");
  });

  it("uses singular grammar correctly", () => {
    const b = buildBriefing(base({ activeCampaigns: 1, unreadReplies: 1 }));
    expect(b.sentence).toBe("1 campaign is sending right now and 1 new reply is waiting.");
  });

  it("falls back to weekly replies when nothing is unread", () => {
    const b = buildBriefing(base({ repliesThisWeek: 5, sentThisWeek: 40 }));
    expect(b.sentence).toContain("5 replies came in this week");
    expect(b.status).toBe("READY");
  });

  it("gives a calm message when idle with campaigns", () => {
    const b = buildBriefing(base());
    expect(b.sentence).toContain("all quiet");
  });

  it("gives an onboarding nudge with no campaigns", () => {
    const b = buildBriefing(base({ hasCampaigns: false }));
    expect(b.sentence).toContain("outreach starts here");
  });

  it("suggests adding leads when the list is small", () => {
    const b = buildBriefing(base({ totalLeads: 10 }));
    expect(b.suggestions.some((s) => s.label === "Add more leads")).toBe(true);
  });

  it("suggests a template when the list is healthy", () => {
    const b = buildBriefing(base({ totalLeads: 500 }));
    expect(b.suggestions.some((s) => s.label === "Write a template")).toBe(true);
  });

  it("always returns at most three suggestions", () => {
    const b = buildBriefing(base({ activeCampaigns: 2, unreadReplies: 4, totalLeads: 5 }));
    expect(b.suggestions.length).toBeLessThanOrEqual(3);
  });
});

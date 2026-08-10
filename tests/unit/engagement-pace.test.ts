import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENGAGEMENT,
  MIN_ENGAGEMENT_FACTOR,
  assessEngagement,
  engagementDailyCap,
} from "@/lib/campaigns/engagementPace";

const LIMIT = 80;

describe("the sample floor", () => {
  it("ignores the reply rate until enough has been sent", () => {
    // A reply can arrive days after the send, so an early zero says nothing
    // except that it is early. Throttling a campaign on its first morning would
    // be both wrong and hard to explain to the person watching it.
    const assessment = assessEngagement({ sentCount: 10, replyCount: 0, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("UNPROVEN");
    expect(assessment.factor).toBe(1);
    expect(engagementDailyCap(LIMIT, assessment)).toBe(LIMIT);
  });

  it("stays quiet rather than reporting a rate it does not trust", () => {
    expect(assessEngagement({ sentCount: 10, replyCount: 0 }).message).toBeNull();
  });

  it("does not throttle a campaign that has sent nothing at all", () => {
    const assessment = assessEngagement({ sentCount: 0, replyCount: 0, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("UNPROVEN");
    expect(engagementDailyCap(LIMIT, assessment)).toBe(LIMIT);
  });

  it("starts judging exactly at the floor, not one send later", () => {
    const at = assessEngagement({
      sentCount: DEFAULT_ENGAGEMENT.minimumSends,
      replyCount: 0,
      dailySendLimit: LIMIT,
    });
    const below = assessEngagement({
      sentCount: DEFAULT_ENGAGEMENT.minimumSends - 1,
      replyCount: 0,
      dailySendLimit: LIMIT,
    });
    expect(below.verdict).toBe("UNPROVEN");
    expect(at.verdict).toBe("POOR");
  });
});

describe("throttling a campaign nobody answers", () => {
  it("halves pacing when nothing is replying", () => {
    const assessment = assessEngagement({ sentCount: 200, replyCount: 0, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("POOR");
    expect(assessment.factor).toBe(MIN_ENGAGEMENT_FACTOR);
    expect(engagementDailyCap(LIMIT, assessment)).toBe(40);
  });

  it("eases off, without halving, on a weak but non-zero rate", () => {
    // 2 of 200 is 1%: low, and not the same as nobody answering.
    const assessment = assessEngagement({ sentCount: 200, replyCount: 2, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("WEAK");
    expect(assessment.factor).toBe(0.75);
    expect(engagementDailyCap(LIMIT, assessment)).toBe(60);
  });

  it("leaves a normal cold-outreach rate completely alone", () => {
    // 4% is an ordinary campaign, and it must not be quietly slowed.
    const assessment = assessEngagement({ sentCount: 200, replyCount: 8, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("HEALTHY");
    expect(assessment.factor).toBe(1);
    expect(assessment.message).toBeNull();
  });

  it("never throttles a campaign to a standstill", () => {
    // A campaign paced to zero looks identical to a broken one, and stopping is
    // a decision for the bounce brake or a person.
    const assessment = assessEngagement({ sentCount: 500, replyCount: 0, dailySendLimit: 1 });
    expect(engagementDailyCap(1, assessment)).toBe(1);
    expect(engagementDailyCap(3, assessment)).toBeGreaterThanOrEqual(1);
  });

  it("explains itself whenever it changes the pace", () => {
    // A silent throttle is a support ticket: the campaign page would show a
    // limit lower than the one the customer typed with nothing accounting for it.
    for (const replies of [0, 2]) {
      const assessment = assessEngagement({
        sentCount: 200,
        replyCount: replies,
        dailySendLimit: LIMIT,
      });
      expect(assessment.factor, `${replies}`).toBeLessThan(1);
      expect(assessment.message, `${replies}`).toBeTruthy();
    }
  });
});

describe("what a strong campaign gets", () => {
  it("is an offer, not a raise", () => {
    // The plan asked for a term that could raise volume by 50%. Applying that
    // automatically would send more mail than the customer authorised, which is
    // the one thing every other term in the composition is careful not to do.
    const assessment = assessEngagement({ sentCount: 200, replyCount: 30, dailySendLimit: LIMIT });
    expect(assessment.verdict).toBe("STRONG");
    expect(assessment.factor).toBe(1);
    expect(engagementDailyCap(LIMIT, assessment)).toBe(LIMIT);
    expect(assessment.suggestedLimit).toBe(120);
  });

  it("never suggests a number the pace checks would then warn about", () => {
    const assessment = assessEngagement({ sentCount: 200, replyCount: 40, dailySendLimit: 140 });
    expect(assessment.suggestedLimit).toBeLessThanOrEqual(150);
  });

  it("suggests nothing when there is no headroom left", () => {
    const assessment = assessEngagement({ sentCount: 200, replyCount: 40, dailySendLimit: 150 });
    expect(assessment.suggestedLimit).toBeNull();
  });

  it("says the rate even when it has no raise to offer", () => {
    const assessment = assessEngagement({ sentCount: 200, replyCount: 40, dailySendLimit: 150 });
    expect(assessment.message).toContain("%");
  });
});

describe("the factor is a ceiling like every other term", () => {
  it("is never above 1, whatever the reply rate", () => {
    for (const replies of [0, 1, 4, 16, 60, 200]) {
      const assessment = assessEngagement({
        sentCount: 200,
        replyCount: replies,
        dailySendLimit: LIMIT,
      });
      expect(assessment.factor, `${replies}`).toBeLessThanOrEqual(1);
      expect(engagementDailyCap(LIMIT, assessment), `${replies}`).toBeLessThanOrEqual(LIMIT);
    }
  });

  it("is never below the floor", () => {
    const assessment = assessEngagement({ sentCount: 10_000, replyCount: 0 });
    expect(assessment.factor).toBeGreaterThanOrEqual(MIN_ENGAGEMENT_FACTOR);
  });
});

describe("counters that are missing or malformed", () => {
  it("treats an absent counter as zero rather than NaN", () => {
    // A campaign written before a counter existed reads as undefined, and NaN
    // compares false against every threshold, which would silently disable the
    // whole mechanism.
    const assessment = assessEngagement({
      sentCount: undefined as unknown as number,
      replyCount: undefined as unknown as number,
      dailySendLimit: LIMIT,
    });
    expect(assessment.verdict).toBe("UNPROVEN");
    expect(Number.isFinite(assessment.replyRate)).toBe(true);
    expect(assessment.factor).toBe(1);
  });

  it("produces a usable cap from a malformed limit", () => {
    const assessment = assessEngagement({ sentCount: 200, replyCount: 0 });
    expect(engagementDailyCap(NaN, assessment)).toBe(0);
    expect(engagementDailyCap(-5, assessment)).toBe(0);
  });

  it("does not invent a rate above 100%", () => {
    // Reply count above send count should not happen, but a follow-up reply
    // counted against an initial-send total could get close.
    const assessment = assessEngagement({ sentCount: 60, replyCount: 900, dailySendLimit: LIMIT });
    expect(assessment.factor).toBe(1);
    expect(assessment.verdict).toBe("STRONG");
  });
});

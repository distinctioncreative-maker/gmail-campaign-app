import { describe, expect, it } from "vitest";
import {
  aggregateDimension,
  bucketBatchSize,
  bucketDailyLimit,
  bucketDelay,
  bucketHasPlaceholders,
  bucketImages,
  bucketLinks,
  bucketSpamScore,
  bucketSubjectLength,
  bucketWordCount,
  buildSnapshot,
  MIN_SAMPLE_TO_SURFACE,
  type CampaignSignal,
} from "@/lib/benchmarks/buckets";

function signal(partial: Partial<CampaignSignal>): CampaignSignal {
  return {
    emailsPerBatch: 5,
    dailySendLimit: 100,
    minDelaySeconds: 5,
    imageCount: 0,
    linkCount: 0,
    spamScore: 90,
    wordCount: 100,
    subjectLength: 25,
    hasPlaceholders: true,
    sent: 50,
    bounceRate: 1,
    replyRate: 5,
    openRate: null,
    clickRate: null,
    ...partial,
  };
}

describe("bucket functions", () => {
  it("buckets batch size", () => {
    expect(bucketBatchSize(2)).toBe("1-3");
    expect(bucketBatchSize(5)).toBe("4-6");
    expect(bucketBatchSize(9)).toBe("7-10");
    expect(bucketBatchSize(20)).toBe("11+");
  });
  it("buckets daily limit", () => {
    expect(bucketDailyLimit(30)).toBe("≤50");
    expect(bucketDailyLimit(80)).toBe("51-100");
    expect(bucketDailyLimit(130)).toBe("101-150");
    expect(bucketDailyLimit(500)).toBe("151+");
  });
  it("buckets delay", () => {
    expect(bucketDelay(2)).toBe("<5s");
    expect(bucketDelay(10)).toBe("5-14s");
    expect(bucketDelay(20)).toBe("15-29s");
    expect(bucketDelay(60)).toBe("30s+");
  });
  it("buckets images and links", () => {
    expect(bucketImages(0)).toBe("0");
    expect(bucketImages(1)).toBe("1-2");
    expect(bucketImages(5)).toBe("3+");
    expect(bucketLinks(0)).toBe("0");
    expect(bucketLinks(2)).toBe("1-2");
    expect(bucketLinks(3)).toBe("3+");
  });
  it("buckets spam score (higher score = lower risk)", () => {
    expect(bucketSpamScore(95)).toBe("low-risk");
    expect(bucketSpamScore(70)).toBe("medium-risk");
    expect(bucketSpamScore(40)).toBe("high-risk");
  });
  it("buckets word count, subject length, and personalization", () => {
    expect(bucketWordCount(50)).toBe("≤75");
    expect(bucketWordCount(400)).toBe("300+");
    expect(bucketSubjectLength(20)).toBe("≤30 chars");
    expect(bucketSubjectLength(60)).toBe("50+ chars");
    expect(bucketHasPlaceholders(true)).toBe("personalized");
    expect(bucketHasPlaceholders(false)).toBe("not personalized");
  });
});

describe("aggregateDimension", () => {
  it("never surfaces a bucket under the minimum sample size", () => {
    const signals = Array.from({ length: MIN_SAMPLE_TO_SURFACE - 1 }, () => signal({ emailsPerBatch: 3 }));
    const agg = aggregateDimension(signals, "emailsPerBatch", "Batch", (s) => bucketBatchSize(s.emailsPerBatch));
    expect(agg.buckets).toHaveLength(0);
  });

  it("surfaces a bucket exactly at the minimum sample size", () => {
    const signals = Array.from({ length: MIN_SAMPLE_TO_SURFACE }, () => signal({ emailsPerBatch: 3 }));
    const agg = aggregateDimension(signals, "emailsPerBatch", "Batch", (s) => bucketBatchSize(s.emailsPerBatch));
    expect(agg.buckets).toHaveLength(1);
    expect(agg.buckets[0].campaigns).toBe(MIN_SAMPLE_TO_SURFACE);
  });

  it("computes correct averages per bucket", () => {
    const signals = [
      ...Array.from({ length: MIN_SAMPLE_TO_SURFACE }, () => signal({ emailsPerBatch: 3, replyRate: 10, bounceRate: 2 })),
      ...Array.from({ length: MIN_SAMPLE_TO_SURFACE }, () => signal({ emailsPerBatch: 20, replyRate: 2, bounceRate: 8 })),
    ];
    const agg = aggregateDimension(signals, "emailsPerBatch", "Batch", (s) => bucketBatchSize(s.emailsPerBatch));
    const small = agg.buckets.find((b) => b.bucket === "1-3");
    const large = agg.buckets.find((b) => b.bucket === "11+");
    expect(small?.avgReplyRate).toBeCloseTo(10, 5);
    expect(large?.avgReplyRate).toBeCloseTo(2, 5);
    // Ranked best reply rate first.
    expect(agg.buckets[0].bucket).toBe("1-3");
  });

  it("keeps openRate/clickRate null when no campaign in the bucket had tracking on", () => {
    const signals = Array.from({ length: MIN_SAMPLE_TO_SURFACE }, () => signal({}));
    const agg = aggregateDimension(signals, "emailsPerBatch", "Batch", (s) => bucketBatchSize(s.emailsPerBatch));
    expect(agg.buckets[0].avgOpenRate).toBeNull();
    expect(agg.buckets[0].avgClickRate).toBeNull();
  });

  it("averages openRate/clickRate only across campaigns that had tracking on", () => {
    const signals = [
      ...Array.from({ length: MIN_SAMPLE_TO_SURFACE - 5 }, () => signal({ openRate: null, clickRate: null })),
      ...Array.from({ length: 5 }, () => signal({ openRate: 40, clickRate: 10 })),
    ];
    const agg = aggregateDimension(signals, "emailsPerBatch", "Batch", (s) => bucketBatchSize(s.emailsPerBatch));
    expect(agg.buckets[0].avgOpenRate).toBeCloseTo(40, 5);
    expect(agg.buckets[0].avgClickRate).toBeCloseTo(10, 5);
  });
});

describe("buildSnapshot", () => {
  it("builds all six dimensions and records the total considered", () => {
    const signals = Array.from({ length: MIN_SAMPLE_TO_SURFACE }, () => signal({}));
    const snap = buildSnapshot(signals);
    expect(snap.totalCampaignsConsidered).toBe(MIN_SAMPLE_TO_SURFACE);
    expect(snap.dimensions.map((d) => d.dimension)).toEqual([
      "emailsPerBatch",
      "dailySendLimit",
      "minDelaySeconds",
      "imageCount",
      "linkCount",
      "spamScore",
      "wordCount",
      "subjectLength",
      "hasPlaceholders",
    ]);
  });
});

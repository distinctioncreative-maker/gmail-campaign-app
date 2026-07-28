/**
 * Pure bucketing + aggregation math for the deliverability benchmarks
 * feature. No I/O here on purpose: lib/benchmarks/aggregate.ts does the
 * Firestore/Admin SDK fetching and calls into this module, so the actual
 * statistics logic is unit-testable without mocking Firestore.
 */

export interface CampaignSignal {
  emailsPerBatch: number;
  dailySendLimit: number;
  minDelaySeconds: number;
  imageCount: number;
  linkCount: number;
  spamScore: number;
  wordCount: number;
  subjectLength: number;
  hasPlaceholders: boolean;
  sent: number;
  bounceRate: number; // 0-100
  replyRate: number; // 0-100
  /** null when the campaign didn't have tracking on. */
  openRate: number | null;
  clickRate: number | null;
}

export interface BucketStat {
  bucket: string;
  campaigns: number;
  avgBounceRate: number;
  avgReplyRate: number;
  avgOpenRate: number | null;
  avgClickRate: number | null;
}

export interface DimensionAggregate {
  dimension: string;
  label: string;
  /** Only buckets meeting the minimum-sample threshold: see
   * MIN_SAMPLE_TO_SURFACE. A dimension can legitimately have zero buckets
   * if nothing in the system has enough campaigns behind it yet. */
  buckets: BucketStat[];
}

export interface BenchmarksSnapshot {
  computedAt: number;
  totalCampaignsConsidered: number;
  dimensions: DimensionAggregate[];
}

/** A campaign's outcomes only mean something once it's sent enough email. */
export const MIN_SENT_FOR_SIGNAL = 20;

/** k-anonymity floor: never surface a bucket with fewer campaigns than this
 * behind it, so no single campaign (and therefore no single user) can be
 * inferred from a published number. */
export const MIN_SAMPLE_TO_SURFACE = 20;

export function bucketBatchSize(n: number): string {
  if (n <= 3) return "1-3";
  if (n <= 6) return "4-6";
  if (n <= 10) return "7-10";
  return "11+";
}

export function bucketDailyLimit(n: number): string {
  if (n <= 50) return "≤50";
  if (n <= 100) return "51-100";
  if (n <= 150) return "101-150";
  return "151+";
}

export function bucketDelay(seconds: number): string {
  if (seconds < 5) return "<5s";
  if (seconds < 15) return "5-14s";
  if (seconds < 30) return "15-29s";
  return "30s+";
}

export function bucketImages(n: number): string {
  return n === 0 ? "0" : n <= 2 ? "1-2" : "3+";
}

export function bucketLinks(n: number): string {
  return n === 0 ? "0" : n <= 2 ? "1-2" : "3+";
}

/** analyzeSpam() scores 0-100, higher = more inbox-friendly. */
export function bucketSpamScore(score: number): string {
  return score >= 85 ? "low-risk" : score >= 65 ? "medium-risk" : "high-risk";
}

export function bucketWordCount(n: number): string {
  if (n <= 75) return "≤75";
  if (n <= 150) return "76-150";
  if (n <= 300) return "151-300";
  return "300+";
}

export function bucketSubjectLength(n: number): string {
  if (n <= 30) return "≤30 chars";
  if (n <= 50) return "31-50 chars";
  return "50+ chars";
}

export function bucketHasPlaceholders(has: boolean): string {
  return has ? "personalized" : "not personalized";
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Group signals by a bucket function, drop groups under the sample floor,
 * and rank the rest best-reply-rate first. */
export function aggregateDimension(
  signals: CampaignSignal[],
  dimension: string,
  label: string,
  bucketOf: (s: CampaignSignal) => string
): DimensionAggregate {
  const groups = new Map<string, CampaignSignal[]>();
  for (const s of signals) {
    const bucket = bucketOf(s);
    const group = groups.get(bucket);
    if (group) group.push(s);
    else groups.set(bucket, [s]);
  }

  const buckets: BucketStat[] = [];
  for (const [bucket, group] of groups) {
    if (group.length < MIN_SAMPLE_TO_SURFACE) continue;
    const tracked = group.filter((s) => s.openRate !== null);
    const trackedClicks = group.filter((s) => s.clickRate !== null);
    buckets.push({
      bucket,
      campaigns: group.length,
      avgBounceRate: average(group.map((s) => s.bounceRate)),
      avgReplyRate: average(group.map((s) => s.replyRate)),
      avgOpenRate: tracked.length > 0 ? average(tracked.map((s) => s.openRate as number)) : null,
      avgClickRate: trackedClicks.length > 0 ? average(trackedClicks.map((s) => s.clickRate as number)) : null,
    });
  }
  buckets.sort((a, b) => b.avgReplyRate - a.avgReplyRate);

  return { dimension, label, buckets };
}

export function buildSnapshot(signals: CampaignSignal[]): BenchmarksSnapshot {
  return {
    computedAt: Date.now(),
    totalCampaignsConsidered: signals.length,
    dimensions: [
      aggregateDimension(signals, "emailsPerBatch", "Emails per batch", (s) => bucketBatchSize(s.emailsPerBatch)),
      aggregateDimension(signals, "dailySendLimit", "Emails per day", (s) => bucketDailyLimit(s.dailySendLimit)),
      aggregateDimension(signals, "minDelaySeconds", "Gap between emails", (s) => bucketDelay(s.minDelaySeconds)),
      aggregateDimension(signals, "imageCount", "Images in the email", (s) => bucketImages(s.imageCount)),
      aggregateDimension(signals, "linkCount", "Links in the email", (s) => bucketLinks(s.linkCount)),
      aggregateDimension(signals, "spamScore", "Spam-word risk", (s) => bucketSpamScore(s.spamScore)),
      aggregateDimension(signals, "wordCount", "Email length", (s) => bucketWordCount(s.wordCount)),
      aggregateDimension(signals, "subjectLength", "Subject line length", (s) => bucketSubjectLength(s.subjectLength)),
      aggregateDimension(signals, "hasPlaceholders", "Personalization", (s) => bucketHasPlaceholders(s.hasPlaceholders)),
    ],
  };
}

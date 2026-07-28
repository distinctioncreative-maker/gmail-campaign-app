import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { listAllOwners } from "@/lib/campaigns/repair";
import { listCampaigns, listRecipients, type OwnerRef } from "@/lib/repositories/campaigns";
import { getTemplate } from "@/lib/repositories/templates";
import { analyzeSpam } from "@/lib/spam/score";
import { listPlaceholders } from "@/lib/personalization/render";
import { totalSent } from "@/lib/analytics/metrics";
import {
  buildSnapshot,
  MIN_SENT_FOR_SIGNAL,
  type CampaignSignal,
  type BenchmarksSnapshot,
} from "./buckets";

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

function wordCount(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Anonymized signal for one campaign — pacing, content, and outcomes, with
 * no user/campaign identifier attached. Returns null when the campaign
 * doesn't have enough sends or a resolvable template to be meaningful. */
async function signalForCampaign(
  owner: OwnerRef,
  campaign: Awaited<ReturnType<typeof listCampaigns>>[number]
): Promise<CampaignSignal | null> {
  const sent = totalSent(campaign);
  if (sent < MIN_SENT_FOR_SIGNAL) return null;
  if (!campaign.initialTemplateId) return null;

  const template = await getTemplate(owner, campaign.initialTemplateId).catch(() => null);
  if (!template) return null;

  const spam = analyzeSpam({ subject: template.subjectTemplate, html: template.htmlTemplate });
  const imageCount = countMatches(template.htmlTemplate, /<img\b/gi);
  const linkCount = countMatches(template.htmlTemplate, /<a\b[^>]*\bhref=/gi);
  const hasPlaceholders =
    listPlaceholders(template.subjectTemplate).length > 0 || listPlaceholders(template.htmlTemplate).length > 0;

  const bounceRate = (campaign.bounceCount / sent) * 100;
  const replyRate = (campaign.replyCount / sent) * 100;

  let openRate: number | null = null;
  let clickRate: number | null = null;
  if (campaign.trackingEnabled) {
    const recipients = await listRecipients(owner, campaign.campaignId).catch(() => []);
    if (recipients.length > 0) {
      openRate = (recipients.filter((r) => r.openedAt !== null).length / recipients.length) * 100;
      clickRate = (recipients.filter((r) => r.firstClickedAt !== null).length / recipients.length) * 100;
    }
  }

  return {
    emailsPerBatch: campaign.schedule.emailsPerBatch,
    dailySendLimit: campaign.schedule.dailySendLimit,
    minDelaySeconds: campaign.schedule.minDelaySeconds,
    imageCount,
    linkCount,
    spamScore: spam.score,
    wordCount: wordCount(template.htmlTemplate),
    subjectLength: template.subjectTemplate.length,
    hasPlaceholders,
    sent,
    bounceRate,
    replyRate,
    openRate,
    clickRate,
  };
}

/**
 * Recompute the global, anonymized deliverability benchmarks by scanning
 * every user's campaigns (same cross-tenant enumeration pattern the
 * existing reply/bounce/repair sweeps already use — see
 * lib/campaigns/repair.ts listAllOwners). Only ever writes bucket-level
 * counts and averages to Firestore; no campaign or user identifier is ever
 * included in the stored snapshot. Meant to run periodically from
 * app/api/cron/sweep (job=benchmarks), never per-request.
 */
export async function recomputeBenchmarks(): Promise<BenchmarksSnapshot> {
  const owners = await listAllOwners();
  const signals: CampaignSignal[] = [];

  for (const owner of owners) {
    const campaigns = await listCampaigns(
      owner,
      Number.POSITIVE_INFINITY
    ).catch(() => []);
    for (const campaign of campaigns) {
      const signal = await signalForCampaign(owner, campaign);
      if (signal) signals.push(signal);
    }
  }

  const snapshot = buildSnapshot(signals);
  await firestore().collection("benchmarks").doc("global").set(snapshot);
  return snapshot;
}

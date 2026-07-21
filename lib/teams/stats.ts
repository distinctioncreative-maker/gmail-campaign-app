import "server-only";
import { listCampaigns } from "@/lib/repositories/campaigns";

export interface RepStats {
  userId: string;
  campaigns: number;
  activeCampaigns: number;
  sent: number;
  replies: number;
  bounces: number;
  replyRate: number; // percent
  lastActivityAt: number | null;
}

/** Roll one rep's campaign counters into leaderboard stats. Uses the cheap
 * per-campaign counters — no recipient-level reads. */
export async function statsForRep(organizationId: string, userId: string): Promise<RepStats> {
  const campaigns = await listCampaigns({ userId, organizationId }, 200);
  let sent = 0;
  let replies = 0;
  let bounces = 0;
  let active = 0;
  let lastActivityAt: number | null = null;
  for (const c of campaigns) {
    sent += c.sentCount + c.followupSentCount;
    replies += c.replyCount;
    bounces += c.bounceCount;
    if (c.status === "ACTIVE") active++;
    lastActivityAt = Math.max(lastActivityAt ?? 0, c.updatedAt);
  }
  return {
    userId,
    campaigns: campaigns.length,
    activeCampaigns: active,
    sent,
    replies,
    bounces,
    replyRate: sent > 0 ? (replies / sent) * 100 : 0,
    lastActivityAt,
  };
}

/** Stats for many reps, fetched in parallel. */
export async function statsForReps(
  organizationId: string,
  userIds: string[]
): Promise<Map<string, RepStats>> {
  const all = await Promise.all(userIds.map((id) => statsForRep(organizationId, id)));
  return new Map(all.map((s) => [s.userId, s]));
}

import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { assessBounces } from "@/lib/campaigns/bounceGuard";

/**
 * The security and abuse checkup.
 *
 * What this looks for is shaped by what can actually go wrong here. For a cold
 * email product the largest platform risk is not a stolen password: it is one
 * customer sending mail that gets the shared sending reputation burned, because
 * that damage lands on every other customer at once and cannot be undone by
 * suspending the account afterwards. So the first thing this surfaces is
 * bounce rate and volume per workspace, not login anomalies.
 *
 * Everything here is a read across tenants, which is a capability no other part
 * of the product has. It is bounded on purpose: fixed limits, no pagination, and
 * no lead data. An operator answering "who is about to burn our domain" needs
 * counts and rates, not the contents of anyone's list, and a portal that showed
 * inboxes would make every operator session a data-exposure risk.
 */

export interface WorkspaceRisk {
  organizationId: string;
  name: string;
  sendingMode: "TEST" | "LIVE";
  sentCount: number;
  bounceCount: number;
  bounceRate: number;
  unsubscribeCount: number;
  replyCount: number;
  campaignCount: number;
  /** Highest severity across this workspace's campaigns. */
  verdict: "OK" | "WATCH" | "ACT";
  reasons: string[];
}

/** Above this share of sends unsubscribing, something about the targeting or the
 * copy is wrong in a way that generates complaints rather than replies. */
const UNSUBSCRIBE_WATCH_RATE = 0.01;
/** A workspace sending this much with almost nobody replying is the shape of a
 * scraped list being worked through. */
const VOLUME_WATCH = 2_000;

export function assessWorkspace(input: {
  organizationId: string;
  name: string;
  sendingMode: "TEST" | "LIVE";
  sentCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  replyCount: number;
  campaignCount: number;
}): WorkspaceRisk {
  const reasons: string[] = [];
  let verdict: WorkspaceRisk["verdict"] = "OK";

  const bounces = assessBounces({
    sentCount: input.sentCount,
    bounceCount: input.bounceCount,
  });
  if (bounces.verdict === "STOP") {
    verdict = "ACT";
    reasons.push(
      `${(bounces.rate * 100).toFixed(1)}% bounce rate across ${input.sentCount} sends. This spends the platform's sending reputation, not just theirs.`
    );
  } else if (bounces.verdict === "WARN") {
    verdict = "WATCH";
    reasons.push(`${(bounces.rate * 100).toFixed(1)}% bounce rate and climbing.`);
  }

  const unsubRate = input.sentCount > 0 ? input.unsubscribeCount / input.sentCount : 0;
  if (input.sentCount >= 200 && unsubRate >= UNSUBSCRIBE_WATCH_RATE) {
    verdict = verdict === "ACT" ? "ACT" : "WATCH";
    reasons.push(
      `${(unsubRate * 100).toFixed(1)}% of sends opted out. Complaints follow opt-outs, and complaints are what get a domain blocked.`
    );
  }

  const replyRate = input.sentCount > 0 ? input.replyCount / input.sentCount : 0;
  if (input.sentCount >= VOLUME_WATCH && replyRate < 0.005) {
    verdict = verdict === "ACT" ? "ACT" : "WATCH";
    reasons.push(
      `${input.sentCount.toLocaleString()} sends and a ${(replyRate * 100).toFixed(2)}% reply rate. High volume with no engagement is the signature of a list nobody opted into.`
    );
  }

  return {
    ...input,
    bounceRate: bounces.rate,
    verdict,
    reasons,
  };
}

/** How many workspaces to inspect. Bounded because this is a fan-out read and an
 * operator dashboard must not become the most expensive page in the product. */
const MAX_ORGS = 200;

export async function workspaceRisks(): Promise<WorkspaceRisk[]> {
  const db = firestore();
  const orgs = await db.collection("organizations").limit(MAX_ORGS).get();

  const rows = await Promise.all(
    orgs.docs.map(async (orgDoc) => {
      const data = orgDoc.data() ?? {};
      const settings = await db
        .collection("organizations")
        .doc(orgDoc.id)
        .collection("organizationSettings")
        .doc("main")
        .get();
      const sendingMode = String(settings.data()?.sendingMode ?? "TEST") === "LIVE" ? "LIVE" : "TEST";

      // Campaign counters are already rolled up per campaign, so a workspace's
      // totals are a collection-group sum rather than a walk over recipients.
      const campaigns = await db
        .collectionGroup("campaigns")
        .where("organizationId", "==", orgDoc.id)
        .limit(500)
        .get();

      let sentCount = 0;
      let bounceCount = 0;
      let unsubscribeCount = 0;
      let replyCount = 0;
      for (const c of campaigns.docs) {
        const d = c.data() ?? {};
        sentCount += Number(d.sentCount) || 0;
        bounceCount += Number(d.bounceCount) || 0;
        unsubscribeCount += Number(d.unsubscribeCount) || 0;
        replyCount += Number(d.replyCount) || 0;
      }

      return assessWorkspace({
        organizationId: orgDoc.id,
        name: String(data.name ?? orgDoc.id),
        sendingMode,
        sentCount,
        bounceCount,
        unsubscribeCount,
        replyCount,
        campaignCount: campaigns.size,
      });
    })
  );

  const rank = { ACT: 0, WATCH: 1, OK: 2 };
  return rows.sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || b.sentCount - a.sentCount
  );
}

export interface PlatformCounts {
  organizations: number;
  users: number;
  liveWorkspaces: number;
  apiKeys: number;
  webhookEndpoints: number;
  signupsLast7Days: number;
}

/** Headline numbers, from aggregation queries rather than document reads. */
export async function platformCounts(): Promise<PlatformCounts> {
  const db = firestore();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [orgs, users, keys, hooks, recent] = await Promise.all([
    db.collection("organizations").count().get(),
    db.collection("users").count().get(),
    db.collection("apiKeys").count().get(),
    db.collectionGroup("webhookEndpoints").count().get(),
    db.collection("users").where("createdAt", ">=", weekAgo).count().get(),
  ]);
  const live = await db
    .collectionGroup("organizationSettings")
    .where("sendingMode", "==", "LIVE")
    .count()
    .get();

  return {
    organizations: orgs.data().count,
    users: users.data().count,
    liveWorkspaces: live.data().count,
    apiKeys: keys.data().count,
    webhookEndpoints: hooks.data().count,
    signupsLast7Days: recent.data().count,
  };
}

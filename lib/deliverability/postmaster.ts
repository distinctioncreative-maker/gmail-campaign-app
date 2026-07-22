import "server-only";
import { google } from "googleapis";
import { oauthClient } from "@/lib/google/oauth";
import { decryptSecret } from "@/lib/kms/crypto";
import { getConnection } from "@/lib/repositories/gmailConnections";

export interface PostmasterDay {
  date: string; // YYYY-MM-DD
  spamRatio: number | null; // 0..1, user-reported spam rate
  domainReputation: string | null; // HIGH | MEDIUM | LOW | BAD
  spfSuccess: number | null;
  dkimSuccess: number | null;
  dmarcSuccess: number | null;
}

export type PostmasterResult =
  | { state: "NOT_CONNECTED" }
  | { state: "NEEDS_RECONNECT" }
  | { state: "NOT_REGISTERED" }
  | { state: "NO_DATA" }
  | { state: "OK"; days: PostmasterDay[]; latestReputation: string | null };

function toDay(name: string | null | undefined): string {
  // trafficStats name ends in YYYYMMDD.
  const m = (name ?? "").match(/(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/**
 * Pull the user's Google Postmaster Tools stats for their sending domain.
 * Uses the same stored Gmail refresh token — connections made before the
 * postmaster scope was added surface NEEDS_RECONNECT. Never throws.
 */
export async function getPostmasterStats(
  userId: string,
  domain: string
): Promise<PostmasterResult> {
  const connection = await getConnection(userId);
  if (!connection || connection.status !== "CONNECTED") return { state: "NOT_CONNECTED" };

  const auth = oauthClient();
  auth.setCredentials({ refresh_token: await decryptSecret(connection.encryptedRefreshToken) });
  const pm = google.gmailpostmastertools({ version: "v1", auth });

  let registered = false;
  try {
    const { data } = await pm.domains.list({ pageSize: 50 });
    registered = (data.domains ?? []).some(
      (d) => d.name?.toLowerCase() === `domains/${domain.toLowerCase()}`
    );
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 403 = token lacks the postmaster scope (pre-scope connection).
    return code === 403 ? { state: "NEEDS_RECONNECT" } : { state: "NEEDS_RECONNECT" };
  }
  if (!registered) return { state: "NOT_REGISTERED" };

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  try {
    const { data } = await pm.domains.trafficStats.list({
      parent: `domains/${domain.toLowerCase()}`,
      "startDate.year": start.getUTCFullYear(),
      "startDate.month": start.getUTCMonth() + 1,
      "startDate.day": start.getUTCDate(),
      "endDate.year": end.getUTCFullYear(),
      "endDate.month": end.getUTCMonth() + 1,
      "endDate.day": end.getUTCDate(),
      pageSize: 31,
    });
    const days: PostmasterDay[] = (data.trafficStats ?? [])
      .map((t) => ({
        date: toDay(t.name),
        spamRatio: t.userReportedSpamRatio ?? null,
        domainReputation: t.domainReputation ?? null,
        spfSuccess: t.spfSuccessRatio ?? null,
        dkimSuccess: t.dkimSuccessRatio ?? null,
        dmarcSuccess: t.dmarcSuccessRatio ?? null,
      }))
      .filter((d) => d.date !== "")
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (days.length === 0) return { state: "NO_DATA" };
    const latestReputation = days.find((d) => d.domainReputation)?.domainReputation ?? null;
    return { state: "OK", days, latestReputation };
  } catch {
    return { state: "NO_DATA" };
  }
}

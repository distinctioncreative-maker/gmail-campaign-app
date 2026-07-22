import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, listRecipients, ownerFromCtx } from "@/lib/repositories/campaigns";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/LocalTime";
import { ScanRepliesButton } from "@/components/analytics/ScanRepliesButton";
import { formatDuration } from "@/lib/analytics/metrics";

// Cap the recipient-level scan so the page stays fast even with many campaigns.
const MAX_CAMPAIGNS_SCANNED = 60;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many replies landed in the last 7 days. */
function countThisWeek(rows: Array<{ repliedAt: number }>): number {
  const cutoff = Date.now() - WEEK_MS;
  return rows.filter((r) => r.repliedAt > cutoff).length;
}

interface ReplyRow {
  contactId: string;
  fullName: string;
  email: string;
  campaignId: string;
  campaignName: string;
  repliedAt: number;
  timeToReplyMs: number | null;
  gmailThreadId: string | null;
}

/**
 * Every reply across all campaigns in one inbox — newest first, one click to
 * the lead or straight into the Gmail thread. This is the page reps live in
 * once campaigns are running.
 */
export default async function RepliesPage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);

  const campaigns = (await listCampaigns(owner, 200))
    .filter((c) => c.sentCount > 0 || c.replyCount > 0)
    .slice(0, MAX_CAMPAIGNS_SCANNED);
  const lists = await Promise.all(
    campaigns.map(async (c) => ({
      campaign: c,
      recipients: await listRecipients(owner, c.campaignId),
    }))
  );

  const rows: ReplyRow[] = [];
  for (const { campaign, recipients } of lists) {
    for (const r of recipients) {
      if (r.repliedAt === null) continue;
      rows.push({
        contactId: r.contactId,
        fullName: r.fullNameSnapshot,
        email: r.emailSnapshot,
        campaignId: campaign.campaignId,
        campaignName: campaign.name,
        repliedAt: r.repliedAt,
        timeToReplyMs: r.initialSentAt !== null ? r.repliedAt - r.initialSentAt : null,
        gmailThreadId: r.gmailThreadId,
      });
    }
  }
  rows.sort((a, b) => b.repliedAt - a.repliedAt);

  const thisWeek = countThisWeek(rows);
  const withTimes = rows.map((r) => r.timeToReplyMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = withTimes.length > 0 ? withTimes[Math.floor(withTimes.length / 2)] : null;

  const kpis = [
    { label: "Total replies", value: String(rows.length) },
    { label: "This week", value: String(thisWeek) },
    { label: "Median time to reply", value: formatDuration(median) },
  ];

  return (
    <div>
      <PageHeader
        title="Replies"
        description="Everyone who has replied to your campaigns, newest first. Open the thread and keep the conversation going."
        actions={<ScanRepliesButton />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-sm font-medium">No replies yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              When someone replies to a campaign email it shows up here. If you&apos;re expecting
              one, hit “Scan for replies” above — replies are also picked up automatically in the
              background.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Replied</th>
                  <th className="px-4 py-3">Took</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.campaignId}-${r.contactId}-${r.repliedAt}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/leads/${r.contactId}`} className="font-medium hover:underline">
                        {r.fullName || r.email}
                      </Link>
                      {r.fullName && <p className="text-xs text-slate-500">{r.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.campaignName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <LocalTime value={r.repliedAt} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDuration(r.timeToReplyMs)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.gmailThreadId && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${r.gmailThreadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Open in Gmail →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

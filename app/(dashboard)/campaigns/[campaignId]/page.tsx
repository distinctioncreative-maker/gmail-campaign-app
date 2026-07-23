import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import {
  getCampaign,
  listEvents,
  listRecipients,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/statusLabels";
import { listTemplates } from "@/lib/repositories/templates";
import { CampaignControls } from "@/components/campaign/CampaignControls";
import { CampaignDiagnostics } from "@/components/campaign/CampaignDiagnostics";
import { RecipientTable } from "@/components/campaign/RecipientTable";
import { LocalTime } from "@/components/LocalTime";
import { LiveRefresh } from "@/components/LiveRefresh";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) notFound();

  const [recipients, events] = await Promise.all([
    listRecipients(owner, campaignId),
    listEvents(owner, campaignId, 50),
  ]);
  const badge = CAMPAIGN_STATUS_LABELS[campaign.status];

  // A/B rotation performance: group recipients by assigned template.
  const abRows: Array<{ name: string; sent: number; replied: number }> = [];
  if (campaign.templateRotation.length > 1) {
    const templates = await listTemplates(ctx, { includeArchived: true });
    const nameById = new Map(templates.map((t) => [t.templateId, t.name]));
    for (const tid of campaign.templateRotation) {
      const group = recipients.filter((r) => r.templateIdSnapshot === tid);
      abRows.push({
        name: nameById.get(tid) ?? "Template",
        sent: group.filter((r) => r.initialSentAt !== null).length,
        replied: group.filter((r) => r.repliedAt !== null).length,
      });
    }
  }

  const totalToSend = campaign.eligibleRecipients;
  const doneCount = campaign.sentCount;
  const pct = totalToSend > 0 ? Math.min(100, Math.round((doneCount / totalToSend) * 100)) : 0;
  const remaining = Math.max(0, totalToSend - doneCount);

  const stats: Array<{ label: string; value: number; tone: string }> = [
    { label: "Recipients", value: campaign.eligibleRecipients, tone: "text-slate-900" },
    { label: "Sent", value: campaign.sentCount, tone: "text-green-600" },
    { label: "Follow-ups", value: campaign.followupSentCount, tone: "text-slate-900" },
    { label: "Replies", value: campaign.replyCount, tone: "text-indigo-600" },
    { label: "Excluded", value: campaign.excludedRecipients, tone: "text-amber-600" },
    { label: "Problems", value: campaign.errorCount, tone: campaign.errorCount > 0 ? "text-red-600" : "text-slate-400" },
  ];

  return (
    <div className="animate-rise">
      <Link href="/campaigns" className="text-sm text-slate-500 hover:underline">
        ← All campaigns
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          {campaign.description && <p className="mt-0.5 text-sm text-slate-500">{campaign.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {campaign.status === "ACTIVE" && <LiveRefresh intervalMs={12000} />}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      {/* Progress */}
      {totalToSend > 0 && (
        <div className="mt-5 card p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-slate-700">
              {doneCount} of {totalToSend} sent
            </p>
            <p className="text-sm text-slate-500">
              {pct}% · {remaining} to go
            </p>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full brand-gradient transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="card card-hover p-4 text-center">
            <p className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <CampaignControls
          campaignId={campaign.campaignId}
          status={campaign.status}
          followupsPaused={campaign.followupsPaused}
          pace={{
            dailySendLimit: campaign.schedule.dailySendLimit,
            emailsPerBatch: campaign.schedule.emailsPerBatch,
            minDelaySeconds: campaign.schedule.minDelaySeconds,
            maxDelaySeconds: campaign.schedule.maxDelaySeconds,
            interBatchDelayMinutes: campaign.schedule.interBatchDelayMinutes,
          }}
        />
      </div>

      <div className="mt-4">
        <CampaignDiagnostics campaignId={campaign.campaignId} />
      </div>

      {abRows.length > 0 && (
        <div className="mt-4 card p-5">
          <h2 className="font-medium">Template performance (A/B)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Template</th>
                  <th className="py-2 pr-4">Sent</th>
                  <th className="py-2 pr-4">Replies</th>
                  <th className="py-2">Reply rate</th>
                </tr>
              </thead>
              <tbody>
                {abRows.map((r, i) => {
                  const rate = r.sent > 0 ? (r.replied / r.sent) * 100 : 0;
                  const best = Math.max(...abRows.map((x) => (x.sent > 0 ? x.replied / x.sent : 0)));
                  const isBest = r.sent > 0 && r.replied / r.sent === best && best > 0;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {r.name}
                        {isBest && <span className="ml-2 text-xs font-semibold text-green-600">★ best</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{r.sent}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.replied}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, rate)}%` }} />
                          </div>
                          <span className="tabular-nums text-xs text-slate-500">
                            {r.sent > 0 ? `${rate.toFixed(1)}%` : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="mb-3 font-medium">Recipients</h2>
          <RecipientTable
            campaignId={campaign.campaignId}
            campaignStatus={campaign.status}
            emailsPerBatch={campaign.schedule.emailsPerBatch}
            recipients={recipients.map((r) => ({
              recipientId: r.recipientId,
              fullName: r.fullNameSnapshot,
              email: r.emailSnapshot,
              status: r.status,
              included: r.included,
              exclusionReason: r.exclusionReason,
              scheduledAt: r.initialScheduledAt,
              sentAt: r.initialSentAt,
              gmailThreadId: r.gmailThreadId,
            }))}
          />
        </div>
        <div>
          <h2 className="mb-3 font-medium">Activity</h2>
          <div className="card p-4">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.eventId} className="text-sm">
                    <p
                      className={
                        e.severity === "ERROR"
                          ? "text-red-700"
                          : e.severity === "WARNING"
                            ? "text-amber-700"
                            : "text-slate-700"
                      }
                    >
                      {e.message}
                    </p>
                    <LocalTime value={e.createdAt} className="text-xs text-slate-400" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

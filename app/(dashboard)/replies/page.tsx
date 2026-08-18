import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listCampaigns, listRecipients, ownerFromCtx } from "@/lib/repositories/campaigns";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReplyFocus } from "@/components/replies/ReplyFocus";
import { LocalTime } from "@/components/LocalTime";
import { ScanRepliesButton } from "@/components/analytics/ScanRepliesButton";
import { DraftReplyButton } from "@/components/replies/DraftReplyButton";
import { OutcomeControl } from "@/components/replies/OutcomeControl";
import { ReplyThreadViewer } from "@/components/replies/ReplyThreadViewer";
import { RepliesKeyboardNav } from "@/components/replies/RepliesKeyboardNav";
import { formatDuration } from "@/lib/analytics/metrics";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { aiWritingEnabled } from "@/lib/ai/enabled";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile, StatGrid, type StatTone } from "@/components/ui/StatTile";
import { Icon, type IconName } from "@/components/ui/Icon";
import { campaignsIncludedInWorkspaceStats } from "@/lib/campaigns/lifecycle";
import { formatDealValue } from "@/lib/campaigns/outcomes";
import type { DealStatus } from "@/schemas/campaign";

// Cap the recipient-level scan so the page stays fast even with many campaigns.
const MAX_CAMPAIGNS_SCANNED = 60;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many replies landed in the last 7 days. */
function countThisWeek(rows: Array<{ repliedAt: number }>): number {
  const cutoff = Date.now() - WEEK_MS;
  return rows.filter((r) => r.repliedAt > cutoff).length;
}

type ReplyIntent = "INTERESTED" | "REPLIED" | "NOT_INTERESTED";

interface ReplyRow {
  contactId: string;
  recipientId: string;
  fullName: string;
  email: string;
  campaignId: string;
  campaignName: string;
  repliedAt: number;
  timeToReplyMs: number | null;
  gmailThreadId: string | null;
  intent: ReplyIntent;
  snippet: string;
  dealStatus: DealStatus | null;
  dealValueCents: number | null;
}

/** How the triage chip reads and ranks. Interested floats to the top. */
const INTENT_META: Record<ReplyIntent, { label: string; className: string; rank: number }> = {
  INTERESTED: { label: "Interested", className: "bg-success-soft text-success", rank: 0 },
  REPLIED: { label: "Needs reply", className: "bg-info-soft text-info", rank: 1 },
  NOT_INTERESTED: { label: "Not interested", className: "bg-surface-2 text-muted", rank: 2 },
};

/**
 * Every reply across all campaigns in one inbox: newest first, one click to
 * the lead or straight into the Gmail thread. This is the page reps live in
 * once campaigns are running.
 */
export default async function RepliesPage() {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);

  const campaigns = campaignsIncludedInWorkspaceStats(
    await listCampaigns(owner, 200)
  )
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
        recipientId: r.recipientId,
        fullName: r.fullNameSnapshot,
        email: r.emailSnapshot,
        campaignId: campaign.campaignId,
        campaignName: campaign.name,
        repliedAt: r.repliedAt,
        timeToReplyMs: r.initialSentAt !== null ? r.repliedAt - r.initialSentAt : null,
        gmailThreadId: r.gmailThreadId,
        intent: (r.replyIntent as ReplyIntent | null) ?? "REPLIED",
        snippet: r.lastReplySnippet,
        dealStatus: r.dealStatus,
        dealValueCents: r.dealValueCents,
      });
    }
  }
  // Hot-first, and anything already actioned sinks: a reply the rep has
  // recorded an outcome for is not work waiting to be done.
  const workRank = (r: ReplyRow) =>
    (r.dealStatus !== null ? 10 : 0) + INTENT_META[r.intent].rank;
  rows.sort((a, b) => workRank(a) - workRank(b) || b.repliedAt - a.repliedAt);

  const thisWeek = countThisWeek(rows);
  const withTimes = rows.map((r) => r.timeToReplyMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = withTimes.length > 0 ? withTimes[Math.floor(withTimes.length / 2)] : null;

  const aiEnabled = aiWritingEnabled(await getOrgSettings(ctx.organizationId));
  const interested = rows.filter((r) => r.intent === "INTERESTED").length;
  const won = rows.filter((r) => r.dealStatus === "WON");
  const wonValueCents = won.reduce((sum, r) => sum + (r.dealValueCents ?? 0), 0);
  const waitingRows = rows.filter((r) => r.dealStatus === null && r.intent !== "NOT_INTERESTED");
  const awaiting = waitingRows.length;
  /**
   * The conversation the focus panel gets. Same predicate as `awaiting`, so the
   * panel and the "Waiting on you" figure are computed from one list and cannot
   * drift apart. rows is already sorted hot-first with actioned replies sunk, so
   * the first waiting row is genuinely the most pressing one.
   */
  const focus = waitingRows[0] ?? null;
  const kpis: Array<{ label: string; value: string; icon: IconName; tone: StatTone; hint: string }> = [
    {
      label: "Interested",
      value: String(interested),
      icon: "sparkles",
      tone: interested > 0 ? "revenue" : "default",
      hint: "Work these first",
    },
    {
      label: "Total replies",
      value: String(rows.length),
      icon: "reply",
      tone: "default",
      hint: "Across every campaign",
    },
    {
      label: "This week",
      value: String(thisWeek),
      icon: "clock",
      tone: thisWeek > 0 ? "success" : "default",
      hint: "Landed in the last 7 days",
    },
    {
      label: "Median time to reply",
      value: formatDuration(median),
      icon: "hourglass",
      tone: "default",
      hint: "How fast your list responds",
    },
    {
      label: "Won",
      // The count is the honest headline: a rep can record a win without
      // knowing the number, so value would understate it.
      value: won.length > 0 ? `${won.length}` : "0",
      icon: "check",
      tone: won.length > 0 ? "revenue" : "default",
      hint:
        wonValueCents > 0
          ? `${formatDealValue(wonValueCents)} recorded`
          : "Mark a reply won to track revenue",
    },
    {
      label: "Waiting on you",
      value: String(awaiting),
      icon: "alert",
      tone: awaiting > 0 ? "warning" : "default",
      hint: "Replies with no outcome yet",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Replies"
        description="Everyone who has replied to your campaigns, ranked so the interested ones come first."
        actions={<ScanRepliesButton />}
      />

      {/* The workspace archetype: the work before the list. The queue below is
          unchanged; what moved is which of them a rep sees first. Renders only
          when something is genuinely waiting, so an inbox that is fully actioned
          shows no panel rather than a finished conversation dressed as work. */}
      {focus && (
        <div className="mb-6">
          <ReplyFocus
            name={focus.fullName}
            email={focus.email}
            campaignName={focus.campaignName}
            contactId={focus.contactId}
            intentLabel={INTENT_META[focus.intent].label}
            intentClassName={INTENT_META[focus.intent].className}
            snippet={focus.snippet}
            repliedAt={focus.repliedAt}
            timeToReply={formatDuration(focus.timeToReplyMs)}
            waiting={awaiting}
          >
            {focus.gmailThreadId && (
              <ReplyThreadViewer
                campaignId={focus.campaignId}
                recipientId={focus.recipientId}
                fullName={focus.fullName}
                email={focus.email}
                fallbackSnippet={focus.snippet}
              />
            )}
            {aiEnabled && (
              <DraftReplyButton
                campaignId={focus.campaignId}
                recipientId={focus.recipientId}
                threadId={focus.gmailThreadId}
              />
            )}
            <OutcomeControl
              campaignId={focus.campaignId}
              recipientId={focus.recipientId}
              status={focus.dealStatus}
              valueCents={focus.dealValueCents}
            />
            {focus.gmailThreadId && (
              <a
                href={`https://mail.google.com/mail/u/0/#all/${focus.gmailThreadId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-3 py-2 text-sm"
              >
                Open in Gmail
                <Icon name="external" size={14} aria-hidden />
              </a>
            )}
          </ReplyFocus>
        </div>
      )}

      <StatGrid columns={3}>
        {kpis.map((k) => (
          <StatTile
            key={k.label}
            label={k.label}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            hint={k.hint}
            size="sm"
          />
        ))}
      </StatGrid>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon="reply"
            title="This is where your pipeline shows up"
            description="Every reply lands here, ranked so the interested ones are on top. They are picked up automatically in the background."
            action={{ href: "/campaigns/new", label: "Start a campaign" }}
            secondaryAction={{ href: "/leads", label: "Import leads first" }}
          />
        ) : (
          <>
          {/* Mobile: reply cards */}
          <ul className="stagger-rows space-y-2 sm:hidden">
            {rows.map((r) => (
              <li key={`m-${r.campaignId}-${r.contactId}-${r.repliedAt}`} className="card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/leads/${r.contactId}`} className="min-w-0">
                    <p className="truncate font-medium">{r.fullName || r.email}</p>
                    {r.fullName && <p className="truncate text-xs text-muted">{r.email}</p>}
                  </Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${INTENT_META[r.intent].className}`}>
                    {INTENT_META[r.intent].label}
                  </span>
                </div>
                {r.snippet && (
                  <p className="mt-1.5 line-clamp-2 rounded-lg bg-surface-2 p-2 text-xs italic text-muted">
                    “{r.snippet}”
                  </p>
                )}
                <p className="mt-1.5 truncate text-xs text-muted">{r.campaignName}</p>
                <div className="mt-2.5 border-t border-border pt-2.5">
                  <OutcomeControl
                    campaignId={r.campaignId}
                    recipientId={r.recipientId}
                    status={r.dealStatus}
                    valueCents={r.dealValueCents}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span><LocalTime value={r.repliedAt} /> · {formatDuration(r.timeToReplyMs)}</span>
                  <div className="flex items-center gap-2">
                    {r.gmailThreadId && (
                      <ReplyThreadViewer
                        campaignId={r.campaignId}
                        recipientId={r.recipientId}
                        fullName={r.fullName}
                        email={r.email}
                        fallbackSnippet={r.snippet}
                        compact
                      />
                    )}
                    {aiEnabled && r.intent !== "NOT_INTERESTED" && (
                      <DraftReplyButton campaignId={r.campaignId} recipientId={r.recipientId} threadId={r.gmailThreadId} compact />
                    )}
                    {r.gmailThreadId && (
                      <a
                        href={`https://mail.google.com/mail/u/0/#all/${r.gmailThreadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground"
                      >
                        Gmail →
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <RepliesKeyboardNav />
          <div className="hidden overflow-x-auto card sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Intent</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Replied</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="stagger-rows">
                {rows.map((r) => (
                  <tr
                    key={`${r.campaignId}-${r.contactId}-${r.repliedAt}`}
                    // Read by components/replies/RepliesKeyboardNav.tsx, which
                    // is what keeps this table a server component.
                    data-reply-row=""
                    data-reply-href={`/leads/${r.contactId}`}
                    className="border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/leads/${r.contactId}`} className="font-medium hover:underline">
                        {r.fullName || r.email}
                      </Link>
                      {r.fullName && <p className="text-xs text-muted">{r.email}</p>}
                      {r.snippet && (
                        <p className="mt-1 max-w-md truncate text-xs italic text-muted">“{r.snippet}”</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INTENT_META[r.intent].className}`}>
                        {INTENT_META[r.intent].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.campaignName}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <LocalTime value={r.repliedAt} />
                      <p className="mt-0.5">{formatDuration(r.timeToReplyMs)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeControl
                        campaignId={r.campaignId}
                        recipientId={r.recipientId}
                        status={r.dealStatus}
                        valueCents={r.dealValueCents}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {r.gmailThreadId && (
                          <ReplyThreadViewer
                            campaignId={r.campaignId}
                            recipientId={r.recipientId}
                            fullName={r.fullName}
                            email={r.email}
                            fallbackSnippet={r.snippet}
                          />
                        )}
                        {aiEnabled && r.intent !== "NOT_INTERESTED" && (
                          <DraftReplyButton campaignId={r.campaignId} recipientId={r.recipientId} threadId={r.gmailThreadId} />
                        )}
                        {r.gmailThreadId && (
                          <a
                            href={`https://mail.google.com/mail/u/0/#all/${r.gmailThreadId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                          >
                            Open in Gmail →
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

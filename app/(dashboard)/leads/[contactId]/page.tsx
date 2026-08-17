import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { EntityHeader } from "@/components/ui/EntityHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { getContact } from "@/lib/repositories/contacts";
import { isSuppressed } from "@/lib/repositories/suppressions";
import { LocalTime } from "@/components/LocalTime";
import { LeadEditor } from "@/components/leads/LeadEditor";
import { TagChips } from "@/components/leads/TagChips";

function fmt(ms: number | null) {
  return ms ? <LocalTime value={ms} /> : "Not available";
}

const OUTCOME_LABELS: Record<string, string> = {
  EMAILED: "Emailed: awaiting reply",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const ctx = await requireUser();
  const { contactId } = await params;
  const contact = await getContact(ctx, contactId);
  if (!contact) notFound();

  const suppression = await isSuppressed(ctx, contact.normalizedEmail);

  const engagement = [
    { label: "Emails sent to them", value: String(contact.emailsSentCount) },
    { label: "Times they replied", value: String(contact.replyCount) },
    { label: "Campaigns included in", value: String(contact.campaignCount) },
    {
      label: "Current status",
      value: contact.lastOutcome ? (OUTCOME_LABELS[contact.lastOutcome] ?? contact.lastOutcome) : "Not contacted yet",
    },
  ];

  return (
    <div>
      {/* The four states were previously four differently-shaped pills rendered
          into `actions`, each with its own colour classes written inline. They
          are one badge now, chosen in a single expression, so the states are
          visibly the same kind of thing as each other. */}
      <EntityHeader
        kicker="Lead"
        title={contact.fullName || contact.email}
        status={
          suppression || contact.emailOptOut
            ? { label: "Excluded for safety", className: "bg-warning-soft text-warning" }
            : contact.repliedAt
              ? {
                  label: `Replied${contact.replyCount > 1 ? ` ${contact.replyCount}\u00d7` : ""}`,
                  className: "bg-success-soft text-success",
                }
              : contact.campaignCount > 0
                ? { label: "Contacted before", className: "bg-info-soft text-info" }
                : { label: "Ready", className: "bg-success-soft text-success" }
        }
        description={contact.businessName || undefined}
        backHref="/leads"
        backLabel="All leads"
        meta={[
          { label: "Email", value: contact.email },
          {
            label: "Emails sent",
            value: (
              <span className="tabular-nums">{contact.emailsSentCount.toLocaleString()}</span>
            ),
          },
          {
            label: "Last contacted",
            value: contact.lastCampaignAt ? (
              <LocalTime value={contact.lastCampaignAt} options={{ dateStyle: "medium" }} />
            ) : (
              <span className="text-muted">Never</span>
            ),
          },
          {
            label: "Added",
            value: <LocalTime value={contact.createdAt} options={{ dateStyle: "medium" }} />,
          },
        ]}
      />

      {/* Engagement at a glance */}
      <div className="mt-6">
        <StatGrid columns={4}>
          {engagement.map((k) => (
            <StatTile
              key={k.label}
              label={k.label}
              value={k.value}
              tone={k.label === "Times they replied" && contact.replyCount > 0 ? "revenue" : "default"}
            />
          ))}
        </StatGrid>
      </div>

      <div className="mt-4">
        <LeadEditor
          contactId={contact.contactId}
          initial={{
            fullName: contact.fullName,
            businessName: contact.businessName,
            phone: contact.phone,
            region: contact.region,
            requestedAmount: contact.requestedAmount,
            leadSource: contact.leadSource,
            notes: contact.notes,
            emailOptOut: contact.emailOptOut,
            tags: contact.tags,
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-6 sm:p-7">
          <h2 className="font-medium">Details</h2>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-muted">Email</dt>
            <dd>{contact.email}</dd>
            <dt className="text-muted">Phone</dt>
            <dd>{contact.phone || "Not available"}</dd>
            <dt className="text-muted">Region</dt>
            <dd>{contact.region || "Not available"}</dd>
            <dt className="text-muted">Requested amount</dt>
            <dd>
              {contact.requestedAmount !== null
                ? `$${contact.requestedAmount.toLocaleString()}`
                : "Not available"}
            </dd>
            <dt className="text-muted">Lead source</dt>
            <dd>{contact.leadSource || "Not available"}</dd>
            <dt className="text-muted">Tags</dt>
            <dd><TagChips tags={contact.tags} /></dd>
            <dt className="text-muted">Date added</dt>
            <dd>{fmt(contact.createdAt)}</dd>
            <dt className="text-muted">Last seen in an import</dt>
            <dd>{fmt(contact.lastSeenAt)}</dd>
          </dl>
          {contact.notes && (
            <div className="mt-4 rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-medium uppercase text-muted">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{contact.notes}</p>
            </div>
          )}
        </div>

        <div className="card p-6 sm:p-7">
          <h2 className="font-medium">Outreach history</h2>
          {contact.campaignCount === 0 && contact.emailsSentCount === 0 ? (
            <p className="mt-3 text-sm text-muted">
              This person has not been included in any of your campaigns yet.
            </p>
          ) : (
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-muted">Last campaign</dt>
              <dd>{contact.lastCampaignName ?? "Not available"}</dd>
              <dt className="text-muted">Last emailed</dt>
              <dd>{fmt(contact.lastCampaignAt)}</dd>
              <dt className="text-muted">First replied</dt>
              <dd>{fmt(contact.repliedAt)}</dd>
              <dt className="text-muted">Most recent reply</dt>
              <dd>{fmt(contact.lastRepliedAt)}</dd>
              <dt className="text-muted">Bounced</dt>
              <dd>{fmt(contact.bouncedAt)}</dd>
              <dt className="text-muted">Unsubscribed</dt>
              <dd>{fmt(contact.unsubscribedAt)}</dd>
            </dl>
          )}

          {(suppression || contact.emailOptOut) && (
            <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              {contact.emailOptOut
                ? "This person is marked Do Not Email and will never receive campaigns."
                : `On your do-not-email list (${suppression?.reason.replaceAll("_", " ").toLowerCase()}).`}
            </p>
          )}
          <p className="mt-4 text-xs text-muted">
            Reply counts update on each reply scan. Use “Scan for replies” on the Reports page to
            sync everything now.
          </p>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import { getContact } from "@/lib/repositories/contacts";
import { isSuppressed } from "@/lib/repositories/suppressions";
import { LocalTime } from "@/components/LocalTime";
import { LeadEditor } from "@/components/leads/LeadEditor";

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
      <PageHeader
        title={contact.fullName || contact.email}
        description={contact.businessName || undefined}
        backHref="/leads"
        backLabel="All leads"
        actions={
          suppression || contact.emailOptOut ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700">
              Excluded for safety
            </span>
          ) : contact.repliedAt ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
              Replied {contact.replyCount > 1 ? `${contact.replyCount}×` : ""}
            </span>
          ) : contact.campaignCount > 0 ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
              Contacted before
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">Ready</span>
          )
        }
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
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-medium">Details</h2>
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
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
            <dt className="text-muted">First imported</dt>
            <dd>{fmt(contact.firstSeenAt)}</dd>
            <dt className="text-muted">Last seen in an import</dt>
            <dd>{fmt(contact.lastSeenAt)}</dd>
          </dl>
          {contact.notes && (
            <div className="mt-4 rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-medium uppercase text-muted/70">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{contact.notes}</p>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-medium">Outreach history</h2>
          {contact.campaignCount === 0 && contact.emailsSentCount === 0 ? (
            <p className="mt-3 text-sm text-muted">
              This person has not been included in any of your campaigns yet.
            </p>
          ) : (
            <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
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
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              {contact.emailOptOut
                ? "This person is marked Do Not Email and will never receive campaigns."
                : `On your do-not-email list (${suppression?.reason.replaceAll("_", " ").toLowerCase()}).`}
            </p>
          )}
          <p className="mt-4 text-xs text-muted/70">
            Reply counts update on each reply scan. Use “Scan for replies” on the Reports page to
            sync everything now.
          </p>
        </div>
      </div>
    </div>
  );
}

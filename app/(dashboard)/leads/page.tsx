import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listContacts } from "@/lib/repositories/contacts";
import { listLeadLists } from "@/lib/repositories/leadLists";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListsBar } from "@/components/leads/LeadListsBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountUp } from "@/components/ui/CountUp";

const PAGE_SIZE = 500;
const MAX_LIMIT = 5000;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const ctx = await requireUser();
  const { limit: rawLimit } = await searchParams;
  const requested = Number(rawLimit);
  const limit = Number.isFinite(requested)
    ? Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Math.floor(requested)))
    : PAGE_SIZE;

  const [contacts, lists] = await Promise.all([
    listContacts(ctx, { limit }),
    listLeadLists(ctx),
  ]);
  const maybeMore = contacts.length === limit && limit < MAX_LIMIT;
  const readyCount = contacts.filter(
    (contact) =>
      !contact.suppressed && !contact.emailOptOut && contact.campaignCount === 0
  ).length;
  const contactedCount = contacts.filter(
    (contact) => contact.campaignCount > 0
  ).length;
  const repliedCount = contacts.filter(
    (contact) => contact.repliedAt !== null
  ).length;
  const excludedCount = contacts.filter(
    (contact) => contact.suppressed || contact.emailOptOut
  ).length;

  const rows: ContactRow[] = contacts.map((c) => ({
    contactId: c.contactId,
    fullName: c.fullName,
    businessName: c.businessName,
    email: c.email,
    phone: c.phone,
    campaignCount: c.campaignCount,
    emailsSentCount: c.emailsSentCount,
    replyCount: c.replyCount,
    suppressed: c.suppressed,
    emailOptOut: c.emailOptOut,
    repliedAt: c.repliedAt,
    lastCampaignAt: c.lastCampaignAt,
  }));

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Build reusable audiences, understand engagement, and keep every campaign list clean."
      />

      {contacts.length > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Ready",
              value: readyCount,
              detail: "Never contacted and safe to email",
              tone: "text-green-600",
            },
            {
              label: "Contacted",
              value: contactedCount,
              detail: "Used in at least one campaign",
              tone: "text-primary",
            },
            {
              label: "Replied",
              value: repliedCount,
              detail: "Detected conversations",
              tone: "text-indigo-600",
            },
            {
              label: "Excluded",
              value: excludedCount,
              detail: "Suppressed or opted out",
              tone: excludedCount > 0 ? "text-amber-600" : "text-muted",
            },
          ].map((item) => (
            <div key={item.label} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {item.label}
              </p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>
                <CountUp value={item.value} />
              </p>
              <p className="mt-1 text-xs text-muted/70">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-8">
        <LeadListsBar lists={lists.map((l) => ({ listId: l.listId, name: l.name, count: l.count }))} />
      </div>

      <ImportChooser />

      <div className="mt-10">
        <div className="mb-3">
          <h2 className="font-semibold">Contact directory</h2>
          <p className="mt-1 text-xs text-muted">
            Search, segment, review engagement, or apply safe bulk actions to the newest {rows.length.toLocaleString()} leads.
          </p>
        </div>
        <ContactsTable contacts={rows} />
        {maybeMore && (
          <div className="mt-3 text-center">
            <Link
              href={`/leads?limit=${Math.min(MAX_LIMIT, limit + PAGE_SIZE)}`}
              className="btn-secondary inline-block px-4 py-2 text-sm"
            >
              Load {PAGE_SIZE} more (showing newest {rows.length})
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

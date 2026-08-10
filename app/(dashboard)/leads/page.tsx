import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { countContacts, listContactsPage } from "@/lib/repositories/contacts";
import { listLeadLists } from "@/lib/repositories/leadLists";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListsBar } from "@/components/leads/LeadListsBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountUp } from "@/components/ui/CountUp";
import { StatTile, StatGrid } from "@/components/ui/StatTile";
import {
  CONTACT_PAGE_SIZE,
  decodeContactCursor,
  decodeCursorTrail,
  encodeContactCursor,
} from "@/lib/leads/contactPagination";
import { LeadDirectoryPagination } from "@/components/leads/LeadDirectoryPagination";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; trail?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;
  const cursor = decodeContactCursor(params.cursor);
  const trail = decodeCursorTrail(params.trail);

  const [page, totalContacts, lists] = await Promise.all([
    listContactsPage(ctx, { pageSize: CONTACT_PAGE_SIZE, cursor }),
    countContacts(ctx),
    listLeadLists(ctx),
  ]);
  const contacts = page.contacts;
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
    tags: c.tags,
    listIds: c.listIds,
    createdAt: c.createdAt,
  }));

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Build reusable audiences, understand engagement, and keep every campaign list clean."
        actions={
          <Link href="/leads/sourcing" className="btn-secondary min-h-11 px-3 py-2 text-sm no-underline">
            Find leads
          </Link>
        }
      />

      {contacts.length > 0 ? (
        <div className="mb-6">
          <StatGrid columns={4}>
            {(
              [
                {
                  label: "Ready",
                  value: readyCount,
                  hint: "On this page, never contacted and safe",
                  icon: "check",
                  tone: "success",
                },
                {
                  label: "Contacted",
                  value: contactedCount,
                  hint: "On this page, used in a campaign",
                  icon: "mail",
                  tone: "primary",
                },
                {
                  label: "Replied",
                  value: repliedCount,
                  hint: "On this page, live conversations",
                  icon: "reply",
                  tone: repliedCount > 0 ? "revenue" : "default",
                },
                {
                  label: "Excluded",
                  value: excludedCount,
                  hint: "On this page, suppressed or opted out",
                  icon: "ban",
                  tone: excludedCount > 0 ? "warning" : "default",
                },
              ] as const
            ).map((item) => (
              <StatTile
                key={item.label}
                label={item.label}
                icon={item.icon}
                tone={item.tone}
                size="sm"
                hint={item.hint}
                value={<CountUp value={item.value} />}
              />
            ))}
          </StatGrid>
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
            {totalContacts.toLocaleString()} total leads. Search, filter, and organize this page of {rows.length.toLocaleString()}.
          </p>
        </div>
        <ContactsTable
          contacts={rows}
          leadLists={lists.map((list) => ({ listId: list.listId, name: list.name }))}
        />
        <LeadDirectoryPagination
          basePath="/leads"
          currentCursor={cursor && params.cursor ? params.cursor : null}
          trail={trail}
          nextCursor={page.nextCursor ? encodeContactCursor(page.nextCursor) : null}
          shown={rows.length}
          total={totalContacts}
        />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getLeadList, listLeadLists } from "@/lib/repositories/leadLists";
import { countContactsInList, listContactsPage } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListHeaderActions } from "@/components/leads/LeadListHeaderActions";
import { EntityHeader } from "@/components/ui/EntityHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CONTACT_PAGE_SIZE,
  decodeContactCursor,
  decodeCursorTrail,
  encodeContactCursor,
} from "@/lib/leads/contactPagination";
import { LeadDirectoryPagination } from "@/components/leads/LeadDirectoryPagination";

export default async function LeadListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ cursor?: string; trail?: string }>;
}) {
  const ctx = await requireUser();
  const { listId } = await params;
  const query = await searchParams;
  const cursor = decodeContactCursor(query.cursor);
  const trail = decodeCursorTrail(query.trail);

  const [list, leadLists] = await Promise.all([
    getLeadList(ctx, listId),
    listLeadLists(ctx),
  ]);
  if (!list) notFound();

  const [page, totalContacts] = await Promise.all([
    listContactsPage(ctx, { pageSize: CONTACT_PAGE_SIZE, cursor, listId }),
    countContactsInList(ctx, listId),
  ]);
  const contacts = page.contacts;
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
    <div className="page-sections">
      {/* Found by the archetype guard rather than by me: this is a fifth detail
          route and it was still using the index header. The count is now a
          real fact in the header instead of a sentence describing it. */}
      <EntityHeader
        kicker="Lead list"
        title={list.name}
        backHref="/leads"
        backLabel="All leads"
        meta={[
          {
            label: "Leads",
            value: <span className="tabular-nums">{totalContacts.toLocaleString()}</span>,
          },
        ]}
        actions={<LeadListHeaderActions listId={list.listId} name={list.name} />}
      />

      {/* Add leads to this list: duplicates already in the list are skipped */}
      <div>
        <h2 className="mb-1">Add leads to this list</h2>
        <p className="mb-3 text-muted">
          Paste or upload leads: anyone already in “{list.name}” is skipped, so you can keep topping
          it up safely.
        </p>
        <ImportChooser listId={list.listId} />
      </div>

      <div>
        <h2 className="section-head">Leads in this list ({totalContacts.toLocaleString()})</h2>
        {totalContacts === 0 ? (
          <EmptyState
            variant="inline"
            icon="users"
            title="This list is empty"
            description="Paste or upload leads above to start building it. Duplicates are skipped automatically."
          />
        ) : (
          <>
            <ContactsTable
              contacts={rows}
              leadLists={leadLists.map((item) => ({ listId: item.listId, name: item.name }))}
            />
            <LeadDirectoryPagination
              basePath={`/leads/lists/${listId}`}
              currentCursor={cursor && query.cursor ? query.cursor : null}
              trail={trail}
              nextCursor={page.nextCursor ? encodeContactCursor(page.nextCursor) : null}
              shown={rows.length}
              total={totalContacts}
            />
          </>
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getLeadList, listLeadLists } from "@/lib/repositories/leadLists";
import { listContactsInList } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListHeaderActions } from "@/components/leads/LeadListHeaderActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function LeadListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const ctx = await requireUser();
  const { listId } = await params;

  const [list, leadLists] = await Promise.all([
    getLeadList(ctx, listId),
    listLeadLists(ctx),
  ]);
  if (!list) notFound();

  const contacts = await listContactsInList(ctx, listId);
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
  }));

  return (
    <div>
      <PageHeader
        title={list.name}
        description={`${rows.length.toLocaleString()} lead${rows.length === 1 ? "" : "s"} in this list`}
        backHref="/leads"
        backLabel="All leads"
        actions={<LeadListHeaderActions listId={list.listId} name={list.name} />}
      />

      {/* Add leads to this list: duplicates already in the list are skipped */}
      <div className="mt-6">
        <h2 className="mb-1 font-medium">Add leads to this list</h2>
        <p className="mb-3 text-sm text-muted">
          Paste or upload leads: anyone already in “{list.name}” is skipped, so you can keep topping
          it up safely.
        </p>
        <ImportChooser listId={list.listId} />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-medium">Leads in this list ({rows.length})</h2>
        {rows.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="users"
            title="This list is empty"
            description="Paste or upload leads above to start building it. Duplicates are skipped automatically."
          />
        ) : (
          <ContactsTable
            contacts={rows}
            leadLists={leadLists.map((item) => ({ listId: item.listId, name: item.name }))}
          />
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getLeadList } from "@/lib/repositories/leadLists";
import { listContactsInList } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListHeaderActions } from "@/components/leads/LeadListHeaderActions";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function LeadListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const ctx = await requireUser();
  const { listId } = await params;

  const list = await getLeadList(ctx, listId);
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
          <div className="card p-8 text-center text-sm text-muted">
            This list is empty. Paste some leads above to start building it.
          </div>
        ) : (
          <ContactsTable contacts={rows} />
        )}
      </div>
    </div>
  );
}

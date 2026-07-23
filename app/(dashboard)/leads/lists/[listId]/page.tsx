import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getLeadList } from "@/lib/repositories/leadLists";
import { listContactsInList } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListHeaderActions } from "@/components/leads/LeadListHeaderActions";

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
      <Link href="/leads" className="text-sm text-slate-500 hover:underline">
        ← All leads
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length.toLocaleString()} lead{rows.length === 1 ? "" : "s"} in this list
          </p>
        </div>
        <LeadListHeaderActions listId={list.listId} name={list.name} />
      </div>

      {/* Add leads to this list — duplicates already in the list are skipped */}
      <div className="mt-6">
        <h2 className="mb-1 font-medium">Add leads to this list</h2>
        <p className="mb-3 text-sm text-slate-500">
          Paste or upload leads — anyone already in “{list.name}” is skipped, so you can keep topping
          it up safely.
        </p>
        <ImportChooser listId={list.listId} />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-medium">Leads in this list ({rows.length})</h2>
        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            This list is empty. Paste some leads above to start building it.
          </div>
        ) : (
          <ContactsTable contacts={rows} />
        )}
      </div>
    </div>
  );
}

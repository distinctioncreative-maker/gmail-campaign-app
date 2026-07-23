import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listContacts } from "@/lib/repositories/contacts";
import { listLeadLists } from "@/lib/repositories/leadLists";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { LeadListsBar } from "@/components/leads/LeadListsBar";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader title="Leads" description="Import leads, then review who is ready to contact." />

      <div className="mb-8">
        <LeadListsBar lists={lists.map((l) => ({ listId: l.listId, name: l.name, count: l.count }))} />
      </div>

      <ImportChooser />

      <div className="mt-10">
        <h2 className="mb-3 font-medium">Your contacts ({rows.length})</h2>
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

import { requireUser } from "@/lib/auth/requireUser";
import { listContacts } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function LeadsPage() {
  const ctx = await requireUser();
  const contacts = await listContacts(ctx, { limit: 500 });

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

      <ImportChooser />

      <div className="mt-10">
        <h2 className="mb-3 font-medium">Your contacts ({rows.length})</h2>
        <ContactsTable contacts={rows} />
      </div>
    </div>
  );
}

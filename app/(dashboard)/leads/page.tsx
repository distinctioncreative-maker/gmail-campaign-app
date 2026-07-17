import { requireUser } from "@/lib/auth/requireUser";
import { listContacts } from "@/lib/repositories/contacts";
import { ImportChooser } from "@/components/imports/ImportChooser";
import { ContactsTable, type ContactRow } from "@/components/ContactsTable";

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
    suppressed: c.suppressed,
    emailOptOut: c.emailOptOut,
    repliedAt: c.repliedAt,
    lastCampaignAt: c.lastCampaignAt,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Leads</h1>
      <p className="mt-1 text-sm text-slate-600">
        Import leads, then review who is ready to contact.
      </p>

      <div className="mt-6">
        <ImportChooser />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-medium">Your contacts ({rows.length})</h2>
        <ContactsTable contacts={rows} />
      </div>
    </div>
  );
}

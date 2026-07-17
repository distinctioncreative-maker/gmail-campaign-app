import { requireUser } from "@/lib/auth/requireUser";
import { listContacts } from "@/lib/repositories/contacts";
import { PasteLeads } from "@/components/imports/PasteLeads";

export default async function LeadsPage() {
  const ctx = await requireUser();
  const contacts = await listContacts(ctx, { limit: 50 });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Leads</h1>
      <p className="mt-1 text-sm text-slate-600">
        Paste a lead list copied from Salesforce, preview it, then import the rows you want.
      </p>

      <div className="mt-6">
        <PasteLeads />
      </div>

      <div className="mt-10">
        <h2 className="font-medium">Your contacts ({contacts.length} most recent)</h2>
        {contacts.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
            No contacts yet. Paste your first lead list above to get started.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.contactId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{c.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.businessName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                    <td className="px-4 py-3">
                      {c.suppressed || c.emailOptOut ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Excluded for safety
                        </span>
                      ) : c.campaignCount > 0 ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Contacted before
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

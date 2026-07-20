import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getContact } from "@/lib/repositories/contacts";
import { isSuppressed } from "@/lib/repositories/suppressions";
import { LocalTime } from "@/components/LocalTime";

function fmt(ms: number | null) {
  return ms ? <LocalTime value={ms} /> : "—";
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const ctx = await requireUser();
  const { contactId } = await params;
  const contact = await getContact(ctx, contactId);
  if (!contact) notFound();

  const suppression = await isSuppressed(ctx, contact.normalizedEmail);

  return (
    <div>
      <Link href="/leads" className="text-sm text-slate-500 hover:underline">
        ← All leads
      </Link>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{contact.fullName || contact.email}</h1>
          <p className="text-slate-600">{contact.businessName}</p>
        </div>
        {suppression || contact.emailOptOut ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700">
            Excluded for safety
          </span>
        ) : contact.repliedAt ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">Replied</span>
        ) : contact.campaignCount > 0 ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
            Contacted before
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">Ready</span>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-medium">Details</h2>
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">Email</dt>
            <dd>{contact.email}</dd>
            <dt className="text-slate-500">Phone</dt>
            <dd>{contact.phone || "—"}</dd>
            <dt className="text-slate-500">Region</dt>
            <dd>{contact.region || "—"}</dd>
            <dt className="text-slate-500">Requested amount</dt>
            <dd>
              {contact.requestedAmount !== null
                ? `$${contact.requestedAmount.toLocaleString()}`
                : "—"}
            </dd>
            <dt className="text-slate-500">Lead source</dt>
            <dd>{contact.leadSource || "—"}</dd>
            <dt className="text-slate-500">First imported</dt>
            <dd>{fmt(contact.firstSeenAt)}</dd>
            <dt className="text-slate-500">Last seen in an import</dt>
            <dd>{fmt(contact.lastSeenAt)}</dd>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-medium">Campaign history</h2>
          {contact.campaignCount === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              This person has not been included in any of your campaigns yet.
            </p>
          ) : (
            <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">Campaigns</dt>
              <dd>{contact.campaignCount}</dd>
              <dt className="text-slate-500">Last campaign</dt>
              <dd>{contact.lastCampaignName ?? "—"}</dd>
              <dt className="text-slate-500">Last contacted</dt>
              <dd>{fmt(contact.lastCampaignAt)}</dd>
              <dt className="text-slate-500">Replied</dt>
              <dd>{fmt(contact.repliedAt)}</dd>
              <dt className="text-slate-500">Bounced</dt>
              <dd>{fmt(contact.bouncedAt)}</dd>
              <dt className="text-slate-500">Unsubscribed</dt>
              <dd>{fmt(contact.unsubscribedAt)}</dd>
              <dt className="text-slate-500">Last outcome</dt>
              <dd>{contact.lastOutcome ?? "—"}</dd>
            </dl>
          )}

          {(suppression || contact.emailOptOut) && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              {contact.emailOptOut
                ? "This person is marked Email Opt Out and will never be emailed."
                : `On your do-not-email list (${suppression?.reason.replaceAll("_", " ").toLowerCase()}).`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listContacts } from "@/lib/repositories/contacts";
import { classifyLead } from "@/lib/leads/classify";

/** Contacts with launch-relevant classification for the campaign wizard. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const contacts = await listContacts(ctx, { limit: 1000 });

  const rows = await Promise.all(
    contacts.map(async (c) => {
      const { classification } = await classifyLead(ctx, {
        email: c.email,
        emailValid: true,
        emailOptOut: c.emailOptOut,
      });
      return {
        contactId: c.contactId,
        fullName: c.fullName,
        businessName: c.businessName,
        email: c.email,
        classification,
        lastCampaignName: c.lastCampaignName,
        lastCampaignAt: c.lastCampaignAt,
      };
    })
  );

  return NextResponse.json({ contacts: rows });
});

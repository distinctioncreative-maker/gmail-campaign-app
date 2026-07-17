import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { parseSalesforceText } from "@/lib/parser/salesforce";
import { ParseRequestSchema } from "@/schemas/parsedLead";
import { normalizeEmail } from "@/lib/parser/normalize";
import { findByNormalizedEmail } from "@/lib/repositories/contacts";
import { isSuppressed } from "@/lib/repositories/suppressions";
import type { LeadClassification } from "@/schemas/contact";

/**
 * Preview endpoint for pasted Salesforce list text. Parses, then
 * classifies each lead against the CURRENT USER's history and
 * suppressions so the UI can show Ready / Opted out / Used before /
 * Missing email badges before anything is imported.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { text } = ParseRequestSchema.parse(await req.json());

  const result = parseSalesforceText(text);

  const classified = await Promise.all(
    result.leads.map(async (lead) => {
      let classification: LeadClassification;
      let lastCampaignName: string | null = null;
      let lastCampaignAt: number | null = null;

      if (!lead.email || !lead.emailValid) {
        classification = "INVALID";
      } else if (lead.emailOptOut === true) {
        classification = "EMAIL_OPT_OUT";
      } else {
        const normalizedEmail = normalizeEmail(lead.email);
        const [suppression, existing] = await Promise.all([
          isSuppressed(ctx, normalizedEmail),
          findByNormalizedEmail(ctx, normalizedEmail),
        ]);
        if (suppression) {
          classification =
            suppression.reason === "UNSUBSCRIBED"
              ? "UNSUBSCRIBED"
              : suppression.reason === "HARD_BOUNCE"
                ? "BOUNCED"
                : "SUPPRESSED";
        } else if (existing) {
          lastCampaignName = existing.lastCampaignName;
          lastCampaignAt = existing.lastCampaignAt;
          classification = existing.repliedAt
            ? "REPLIED_BEFORE"
            : existing.campaignCount > 0
              ? "CONTACTED_BEFORE"
              : "EXISTING_NOT_CONTACTED";
        } else {
          classification = "NEW";
        }
      }

      return { ...lead, classification, lastCampaignName, lastCampaignAt };
    })
  );

  return NextResponse.json({
    leads: classified,
    totalRecords: result.totalRecords,
    globalWarnings: result.globalWarnings,
  });
});

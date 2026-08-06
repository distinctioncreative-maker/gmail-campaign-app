import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { parseSalesforceText } from "@/lib/parser/salesforce";
import { ParseRequestSchema } from "@/schemas/parsedLead";
import { classifyLead } from "@/lib/leads/classify";
import { verifyLeadBatch } from "@/lib/leads/verifyBatch";

/**
 * Preview endpoint for pasted Salesforce list text. Parses, then
 * classifies each lead against the CURRENT USER's history and
 * suppressions so the UI can show Ready / Opted out / Used before /
 * Missing email badges before anything is imported.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.leadParse);
  const { text } = ParseRequestSchema.parse(await req.json());

  const result = parseSalesforceText(text);

  const classified = await Promise.all(
    result.leads.map(async (lead) => ({
      ...lead,
      ...(await classifyLead(ctx, lead)),
    }))
  );

  const { verified, counts } = await verifyLeadBatch(classified);

  return NextResponse.json({
    leads: verified,
    totalRecords: result.totalRecords,
    globalWarnings: result.globalWarnings,
    verification: counts,
  });
});

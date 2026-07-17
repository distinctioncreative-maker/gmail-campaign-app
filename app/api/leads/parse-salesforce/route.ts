import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { parseSalesforceText } from "@/lib/parser/salesforce";
import { ParseRequestSchema } from "@/schemas/parsedLead";
import { classifyLead } from "@/lib/leads/classify";

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
    result.leads.map(async (lead) => ({
      ...lead,
      ...(await classifyLead(ctx, lead)),
    }))
  );

  return NextResponse.json({
    leads: classified,
    totalRecords: result.totalRecords,
    globalWarnings: result.globalWarnings,
  });
});

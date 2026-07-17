import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { parseCsvLeads, CSV_FIELDS, type CsvMapping } from "@/lib/leads/csv";
import { classifyLead } from "@/lib/leads/classify";
import { getSavedCsvMapping, saveCsvMapping } from "@/lib/repositories/userSettings";

const BodySchema = z.object({
  csvText: z.string().min(1).max(5_000_000),
  mapping: z.record(z.string(), z.enum(CSV_FIELDS)).optional(),
  saveMapping: z.boolean().optional(),
});

/**
 * CSV import preview. First call without a mapping: auto-detects columns
 * (falling back to the user's saved mapping profile). Subsequent calls can
 * pass a corrected mapping; `saveMapping` persists it for next time.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { csvText, mapping, saveMapping: shouldSave } = BodySchema.parse(await req.json());

  let effectiveMapping: CsvMapping | undefined = mapping;
  if (!effectiveMapping) {
    const saved = await getSavedCsvMapping(ctx);
    if (saved) effectiveMapping = saved;
  }

  const result = parseCsvLeads(csvText, effectiveMapping);

  // A saved mapping may not match this file's headers; fall back to detection.
  if (
    effectiveMapping &&
    !mapping &&
    result.headers.some((h) => !(h in (effectiveMapping as CsvMapping)))
  ) {
    const fresh = parseCsvLeads(csvText);
    result.mapping = fresh.mapping;
    result.leads = fresh.leads;
    result.globalWarnings = fresh.globalWarnings;
  }

  if (shouldSave && mapping) await saveCsvMapping(ctx, mapping);

  const classified = await Promise.all(
    result.leads.map(async (lead) => ({
      ...lead,
      ...(await classifyLead(ctx, lead)),
    }))
  );

  return NextResponse.json({
    headers: result.headers,
    mapping: result.mapping,
    fields: CSV_FIELDS,
    leads: classified,
    totalRecords: classified.length,
    globalWarnings: result.globalWarnings,
  });
});

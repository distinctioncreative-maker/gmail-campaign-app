import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { ParsedLeadSchema } from "@/schemas/parsedLead";
import { upsertFromParsedLead } from "@/lib/repositories/contacts";
import { addSuppression } from "@/lib/repositories/suppressions";
import { normalizeEmail } from "@/lib/parser/normalize";
import { firestore } from "@/lib/firebase/admin";

const ImportRequestSchema = z.object({
  leads: z.array(ParsedLeadSchema).min(1).max(2000),
});

/**
 * Import user-approved leads as contacts. Server-side rules are applied
 * regardless of what the client sent:
 * - leads without a valid email are skipped
 * - Email Opt Out = true is never imported as contactable: the contact
 *   is recorded with an EMAIL_OPT_OUT suppression so every later stage
 *   excludes it.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { leads } = ImportRequestSchema.parse(await req.json());

  const importId = crypto.randomUUID();
  const now = Date.now();

  let imported = 0;
  let updated = 0;
  let skippedInvalid = 0;
  let optOuts = 0;

  for (const lead of leads) {
    if (!lead.email || !lead.emailValid) {
      skippedInvalid++;
      continue;
    }
    const { existed } = await upsertFromParsedLead(ctx, lead, importId);
    if (existed) updated++;
    else imported++;

    if (lead.emailOptOut === true) {
      optOuts++;
      await addSuppression(ctx, {
        email: lead.email,
        normalizedEmail: normalizeEmail(lead.email),
        reason: "EMAIL_OPT_OUT",
        scope: "USER",
        source: "SALESFORCE_IMPORT",
        details: "Marked Email Opt Out in the pasted Salesforce list",
      });
    }
  }

  await firestore()
    .collection("users")
    .doc(ctx.userId)
    .collection("imports")
    .doc(importId)
    .create({
      importId,
      ownerUserId: ctx.userId,
      organizationId: ctx.organizationId,
      createdByUserId: ctx.userId,
      source: "SALESFORCE_PASTE",
      totalSubmitted: leads.length,
      imported,
      updated,
      skippedInvalid,
      optOuts,
      createdAt: now,
      updatedAt: now,
    });

  return NextResponse.json({ importId, imported, updated, skippedInvalid, optOuts });
});

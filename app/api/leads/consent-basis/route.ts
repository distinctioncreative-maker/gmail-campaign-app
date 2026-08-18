import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { assertWritesAllowed } from "@/lib/platform/readonly";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import {
  consentCoverage,
  recordConsentBasisForUnrecorded,
} from "@/lib/repositories/contacts";
import { SELECTABLE_CONSENT_BASES } from "@/lib/compliance/consent";

const RequestSchema = z.object({
  basis: z.enum(SELECTABLE_CONSENT_BASES),
  note: z.string().max(300).default(""),
  /** Page cursor from the previous call. Absent starts a fresh sweep. */
  cursor: z.string().min(1).nullish(),
});

/**
 * Record a lawful basis across contacts that predate the field.
 *
 * This exists so the answer to "where did these come from?" can be given once
 * for a whole backlog instead of contact by contact. It only ever fills gaps:
 * a contact that already carries a basis is left exactly as it is, so this is
 * safe to run repeatedly and cannot be used to rewrite history.
 *
 * The client calls it in a loop, passing back the cursor, until `done`.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.leadImport);
  await assertWritesAllowed();

  const { basis, note, cursor } = RequestSchema.parse(await req.json());

  const page = await recordConsentBasisForUnrecorded(ctx, basis, note, cursor ?? null);
  const coverage = page.done ? await consentCoverage(ctx) : null;

  return NextResponse.json({
    updated: page.updated,
    scanned: page.scanned,
    cursor: page.cursor,
    done: page.done,
    remaining: coverage?.unrecorded ?? null,
  });
});

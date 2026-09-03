import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { assertWritesAllowed } from "@/lib/platform/readonly";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { ParsedLeadSchema } from "@/schemas/parsedLead";
import { upsertFromParsedLead, addContactToList } from "@/lib/repositories/contacts";
import { addSuppression } from "@/lib/repositories/suppressions";
import { getLeadList, bumpLeadListCount } from "@/lib/repositories/leadLists";
import { normalizeEmail } from "@/lib/parser/normalize";
import { firestore } from "@/lib/firebase/admin";
import { auditActor, recordAudit } from "@/lib/audit/log";
import { LEAD_IMPORT_BATCH_SIZE } from "@/lib/leads/importBatching";
import { SELECTABLE_CONSENT_BASES } from "@/lib/compliance/consent";

const ImportRequestSchema = z.object({
  leads: z.array(ParsedLeadSchema).min(1).max(LEAD_IMPORT_BATCH_SIZE),
  listId: z.string().min(1).optional(),
  /**
   * Why this workspace may email the people in this file.
   *
   * Required, and UNKNOWN is not in the accepted set: that value exists only
   * for rows imported before this field did, so accepting it from a client
   * would reintroduce the gap it closes. The import screen preselects the
   * common case, so answering costs a glance rather than a decision.
   */
  consentBasis: z.enum(SELECTABLE_CONSENT_BASES),
  consentNote: z.string().max(300).default(""),
  /**
   * Treat this file's opt-out column as information rather than as a promise.
   *
   * Scoped to the column and nothing else. A person who unsubscribed from this
   * workspace's email, hard-bounced, or complained is untouched by this: those
   * carry different reason codes and are never written from here. The reason
   * is required because the record of WHY is the part worth keeping.
   */
  ignoreFileOptOut: z.boolean().default(false),
  optOutOverrideReason: z.string().max(300).default(""),
});

/**
 * Import user-approved leads as contacts. Server-side rules are applied
 * regardless of what the client sent:
 * - leads without a valid email are skipped
 * - Email Opt Out = true is not imported as contactable BY DEFAULT: the
 *   contact is recorded with an EMAIL_OPT_OUT suppression so every later
 *   stage excludes it. `ignoreFileOptOut` turns that off for one import,
 *   with a stated reason, and reaches nothing else. See below.
 * - every contact is stamped with the lawful basis declared for this import,
 *   and the declaration is recorded on the import document so the answer
 *   survives even if the contacts are later edited.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.leadImport);
  await assertWritesAllowed();
  const { leads, listId, consentBasis, consentNote, ignoreFileOptOut, optOutOverrideReason } =
    ImportRequestSchema.parse(await req.json());

  // The reason is not optional in practice, only in the schema. Requiring it
  // here rather than in the type keeps the failure a readable message instead
  // of a validation blob.
  if (ignoreFileOptOut && optOutOverrideReason.trim().length < 3) {
    return NextResponse.json(
      { error: "Say why this file's opt-out column does not apply before importing past it." },
      { status: 400 }
    );
  }

  // Validate the target list up front (if adding to one).
  const targetList = listId ? await getLeadList(ctx, listId) : null;
  if (listId && !targetList) {
    return NextResponse.json({ error: "That lead list no longer exists." }, { status: 404 });
  }

  const importId = crypto.randomUUID();
  const now = Date.now();

  let imported = 0;
  let updated = 0;
  let skippedInvalid = 0;
  let optOuts = 0;
  let addedToList = 0;
  let alreadyInList = 0;

  for (const lead of leads) {
    if (!lead.email || !lead.emailValid) {
      skippedInvalid++;
      continue;
    }
    const { contact, existed } = await upsertFromParsedLead(
      ctx,
      lead,
      importId,
      { basis: consentBasis, note: consentNote },
      { ignoreFileOptOut }
    );
    if (existed) updated++;
    else imported++;

    if (listId) {
      const wasMember = existed && contact.listIds.includes(listId);
      const added = await addContactToList(ctx, contact.contactId, listId, wasMember);
      if (added) addedToList++;
      else alreadyInList++;
    }

    if (lead.emailOptOut === true) {
      optOuts++;
      // The override lives here and only here. Nothing in this branch can
      // reach a suppression written by the unsubscribe route, the bounce
      // sweep, or a person clicking Do Not Email: those are separate writes
      // with separate reason codes, and this code never touches them.
      if (!ignoreFileOptOut) {
        await addSuppression(ctx, {
          email: lead.email,
          normalizedEmail: normalizeEmail(lead.email),
          reason: "EMAIL_OPT_OUT",
          scope: "USER",
          source: "FILE_IMPORT",
          details: "Marked as opted out by a column in the imported file",
        });
      }
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
      // Kept on the import as well as on each contact: this is the record of
      // what was declared at the time, and it stays true even if a contact is
      // later edited or deleted.
      consentBasis,
      consentNote,
      totalSubmitted: leads.length,
      imported,
      updated,
      skippedInvalid,
      optOuts,
      // What was decided about this file's opt-out column, kept on the import
      // itself so the answer survives the contacts being edited or deleted.
      ignoredFileOptOut: ignoreFileOptOut,
      optOutOverrideReason: ignoreFileOptOut ? optOutOverrideReason : "",
      createdAt: now,
      updatedAt: now,
    });

  if (ignoreFileOptOut && optOuts > 0) {
    await recordAudit(auditActor(ctx), {
      action: "leads.opt_out_column_overridden",
      summary: `Imported ${optOuts} contact${optOuts === 1 ? "" : "s"} marked opted out by the file's own column, without suppressing them.`,
      details: {
        importId,
        contacts: optOuts,
        reason: optOutOverrideReason,
      },
    });
  }

  if (listId && addedToList > 0) {
    await bumpLeadListCount(ctx, listId, addedToList);
  }

  return NextResponse.json({
    importId,
    imported,
    updated,
    skippedInvalid,
    optOuts,
    addedToList,
    alreadyInList,
    listName: targetList?.name ?? null,
  });
});

import "server-only";
import crypto from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import { ContactSchema, type Contact } from "@/schemas/contact";
import type { Scope } from "@/lib/repositories/scope";
import type { ParsedLead } from "@/schemas/parsedLead";
import {
  normalizeBusinessName,
  normalizeEmail,
  normalizePhone,
} from "@/lib/parser/normalize";
import {
  splitFullName,
  type ContactPatch,
  type ContactEngagement,
} from "@/lib/leads/engagement";
import {
  addContactTag,
  normalizeContactTags,
  removeContactTag,
  sameContactTags,
} from "@/lib/leads/tags";
import type { ContactCursor } from "@/lib/leads/contactPagination";
import { SELECTABLE_CONSENT_BASES, type ConsentBasis } from "@/lib/compliance/consent";

/**
 * All contact access is scoped by the verified AuthContext. The owner's
 * user ID is part of the document path (users/{uid}/contacts), so a
 * query can never cross into another user's data.
 */

function contactsRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("contacts");
}

function leadListsRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("leadLists");
}

export async function findByNormalizedEmail(
  ctx: Scope,
  normalizedEmail: string
): Promise<Contact | null> {
  const snap = await contactsRef(ctx)
    .where("normalizedEmail", "==", normalizedEmail)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return ContactSchema.parse(snap.docs[0].data());
}

export async function listContacts(
  ctx: Scope,
  opts: { limit?: number } = {}
): Promise<Contact[]> {
  const snap = await contactsRef(ctx)
    .orderBy("createdAt", "desc")
    .limit(opts.limit ?? 200)
    .get();
  return snap.docs.map((d) => ContactSchema.parse(d.data()));
}

/** Stable, bounded directory page. The cursor combines createdAt with the
 * document ID so contacts created in the same millisecond cannot be skipped. */
export async function listContactsPage(
  ctx: Scope,
  options: { pageSize: number; cursor?: ContactCursor | null; listId?: string }
): Promise<{ contacts: Contact[]; nextCursor: ContactCursor | null }> {
  let query: FirebaseFirestore.Query = options.listId
    ? contactsRef(ctx).where("listIds", "array-contains", options.listId)
    : contactsRef(ctx);
  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (options.cursor) {
    query = query.startAfter(options.cursor.createdAt, options.cursor.contactId);
  }

  const snap = await query.limit(options.pageSize + 1).get();
  const pageDocs = snap.docs.slice(0, options.pageSize);
  const contacts = pageDocs.map((doc) => ContactSchema.parse(doc.data()));
  const last = pageDocs.at(-1);
  const nextCursor =
    snap.size > options.pageSize && last
      ? { createdAt: ContactSchema.parse(last.data()).createdAt, contactId: last.id }
      : null;
  return { contacts, nextCursor };
}

export async function getContact(
  ctx: Scope,
  contactId: string
): Promise<Contact | null> {
  const snap = await contactsRef(ctx).doc(contactId).get();
  return snap.exists ? ContactSchema.parse(snap.data()) : null;
}

/**
 * Mark a contact as actually contacted: called when an email is genuinely
 * sent (not at launch), so prior-contact detection reflects real sends and
 * recipients who were cancelled/skipped are never counted as contacted.
 * The campaign count increments atomically.
 */
export async function markContacted(
  ctx: Scope,
  contactId: string,
  info: { campaignId: string; campaignName: string; at: number }
): Promise<void> {
  await contactsRef(ctx)
    .doc(contactId)
    .update({
      campaignCount: FieldValue.increment(1),
      lastCampaignId: info.campaignId,
      lastCampaignName: info.campaignName,
      lastCampaignAt: info.at,
      updatedAt: info.at,
    })
    .catch(() => {
      // Contact may have been deleted between launch and send: ignore.
    });
}

/**
 * Release the "contacted" mark that a campaign put on contacts that never
 * actually received an email (e.g. a cancelled/stopped campaign, or leads
 * marked by the old launch-time behaviour). Only touches contacts whose most
 * recent campaign is this one, and decrements the count (floored at 0) so a
 * contact reached by an earlier real campaign stays counted. Returns how many
 * were freed.
 */
export async function releaseContactsForCampaign(
  ctx: Scope,
  campaignId: string,
  contactIds: string[]
): Promise<number> {
  if (contactIds.length === 0) return 0;
  const db = firestore();
  const now = Date.now();
  let released = 0;
  for (let i = 0; i < contactIds.length; i += 200) {
    const refs = contactIds.slice(i, i + 200).map((id) => contactsRef(ctx).doc(id));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let inBatch = 0;
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { campaignCount?: number; lastCampaignId?: string | null };
      if (data.lastCampaignId !== campaignId) continue;
      batch.update(snap.ref, {
        campaignCount: Math.max(0, (data.campaignCount ?? 0) - 1),
        lastCampaignId: null,
        lastCampaignName: null,
        lastCampaignAt: null,
        updatedAt: now,
      });
      inBatch++;
      released++;
    }
    if (inBatch > 0) await batch.commit();
  }
  return released;
}

/** Apply a rep's edits from the lead page. Normalized fields are recomputed
 * so search/dedup keep working; email itself is never editable here. */
export async function updateContactDetails(
  ctx: Scope,
  contactId: string,
  patch: ContactPatch
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.fullName !== undefined) {
    const { firstName, lastName } = splitFullName(patch.fullName);
    update.fullName = patch.fullName;
    update.firstName = firstName;
    update.lastName = lastName;
  }
  if (patch.businessName !== undefined) {
    update.businessName = patch.businessName;
    update.normalizedBusinessName = normalizeBusinessName(patch.businessName);
  }
  if (patch.phone !== undefined) {
    update.phone = patch.phone;
    update.normalizedPhone = patch.phone ? normalizePhone(patch.phone) : "";
  }
  if (patch.region !== undefined) update.region = patch.region;
  if (patch.requestedAmount !== undefined) update.requestedAmount = patch.requestedAmount;
  if (patch.leadSource !== undefined) update.leadSource = patch.leadSource;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.emailOptOut !== undefined) update.emailOptOut = patch.emailOptOut;
  if (patch.tags !== undefined) update.tags = normalizeContactTags(patch.tags);
  await contactsRef(ctx).doc(contactId).update(update);
}

/** Permanently delete a lead and keep every saved-list count accurate.
 * Campaign snapshots are unaffected because they carry their own copies. */
export async function deleteContact(ctx: Scope, contactId: string): Promise<void> {
  const db = firestore();
  const contactRef = contactsRef(ctx).doc(contactId);
  await db.runTransaction(async (tx) => {
    const contactSnap = await tx.get(contactRef);
    if (!contactSnap.exists) return;
    const contact = ContactSchema.parse(contactSnap.data());
    const listRefs = [...new Set(contact.listIds)].map((listId) => leadListsRef(ctx).doc(listId));
    const listSnaps = listRefs.length > 0 ? await tx.getAll(...listRefs) : [];
    const now = Date.now();

    for (const listSnap of listSnaps) {
      if (!listSnap.exists) continue;
      const count = Number(listSnap.data()?.count ?? 0);
      tx.update(listSnap.ref, { count: Math.max(0, count - 1), updatedAt: now });
    }
    tx.delete(contactRef);
  });
}

/** Delete many leads transactionally while decrementing saved-list counts. */
export async function bulkDeleteContacts(ctx: Scope, contactIds: string[]): Promise<number> {
  const db = firestore();
  let deleted = 0;
  for (let i = 0; i < contactIds.length; i += 200) {
    const refs = contactIds.slice(i, i + 200).map((id) => contactsRef(ctx).doc(id));
    deleted += await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      const existing = snaps.filter((snap) => snap.exists);
      const membershipCounts = new Map<string, number>();
      for (const snap of existing) {
        const contact = ContactSchema.parse(snap.data());
        for (const listId of new Set(contact.listIds)) {
          membershipCounts.set(listId, (membershipCounts.get(listId) ?? 0) + 1);
        }
      }

      const listRefs = [...membershipCounts.keys()].map((listId) => leadListsRef(ctx).doc(listId));
      const listSnaps = listRefs.length > 0 ? await tx.getAll(...listRefs) : [];
      const now = Date.now();
      for (const listSnap of listSnaps) {
        if (!listSnap.exists) continue;
        const count = Number(listSnap.data()?.count ?? 0);
        const removed = membershipCounts.get(listSnap.id) ?? 0;
        tx.update(listSnap.ref, { count: Math.max(0, count - removed), updatedAt: now });
      }
      for (const snap of existing) tx.delete(snap.ref);
      return existing.length;
    });
  }
  return deleted;
}

/** Add or remove one tag across selected contacts. Returns actual changes. */
export async function bulkUpdateContactTags(
  ctx: Scope,
  contactIds: string[],
  tag: string,
  action: "add" | "remove"
): Promise<number> {
  const db = firestore();
  let updated = 0;
  for (let i = 0; i < contactIds.length; i += 300) {
    const refs = contactIds.slice(i, i + 300).map((id) => contactsRef(ctx).doc(id));
    updated += await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      const now = Date.now();
      let changed = 0;
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const contact = ContactSchema.parse(snap.data());
        const next = action === "add" ? addContactTag(contact.tags, tag) : removeContactTag(contact.tags, tag);
        if (sameContactTags(contact.tags, next)) continue;
        tx.update(snap.ref, { tags: next, updatedAt: now });
        changed++;
      }
      return changed;
    });
  }
  return updated;
}

/** Move selected contacts into or out of one saved list and update its count
 * in the same transaction, so repeated requests remain idempotent. */
export async function bulkUpdateContactList(
  ctx: Scope,
  contactIds: string[],
  listId: string,
  action: "add" | "remove"
): Promise<number> {
  const db = firestore();
  const listRef = leadListsRef(ctx).doc(listId);
  let updated = 0;
  for (let i = 0; i < contactIds.length; i += 200) {
    const refs = contactIds.slice(i, i + 200).map((id) => contactsRef(ctx).doc(id));
    updated += await db.runTransaction(async (tx) => {
      const [listSnap, ...contactSnaps] = await tx.getAll(listRef, ...refs);
      if (!listSnap.exists) throw new Error("Lead list no longer exists");
      const currentCount = Number(listSnap.data()?.count ?? 0);
      const now = Date.now();
      let changed = 0;

      for (const snap of contactSnaps) {
        if (!snap.exists) continue;
        const contact = ContactSchema.parse(snap.data());
        const member = contact.listIds.includes(listId);
        if ((action === "add" && member) || (action === "remove" && !member)) continue;
        tx.update(snap.ref, {
          listIds: action === "add" ? FieldValue.arrayUnion(listId) : FieldValue.arrayRemove(listId),
          updatedAt: now,
        });
        changed++;
      }

      const delta = action === "add" ? changed : -changed;
      tx.update(listRef, { count: Math.max(0, currentCount + delta), updatedAt: now });
      return changed;
    });
  }
  return updated;
}

/** Set the Do-Not-Email flag on many leads at once. */
export async function bulkSetOptOut(
  ctx: Scope,
  contactIds: string[],
  emailOptOut: boolean
): Promise<number> {
  const db = firestore();
  const now = Date.now();
  let updated = 0;
  for (let i = 0; i < contactIds.length; i += 400) {
    const batch = db.batch();
    for (const id of contactIds.slice(i, i + 400)) {
      batch.update(contactsRef(ctx).doc(id), { emailOptOut, updatedAt: now });
      updated++;
    }
    await batch.commit();
  }
  return updated;
}

/** Count one genuinely sent email (initial or follow-up) on the contact. */
export async function recordEmailSent(ctx: Scope, contactId: string, at: number): Promise<void> {
  await contactsRef(ctx)
    .doc(contactId)
    .update({ emailsSentCount: FieldValue.increment(1), lastOutcome: "EMAILED", updatedAt: at })
    .catch(() => {
      // Contact may have been deleted after launch: ignore.
    });
}

export type EngagementEvent = "REPLIED" | "UNSUBSCRIBED" | "BOUNCED_HARD" | "BOUNCED_SOFT";

/** Mirror a campaign engagement event (reply/bounce/unsubscribe) onto the
 * contact so the Leads pages reflect reality without scanning campaigns. */
export async function recordEngagementByEmail(
  ctx: Scope,
  normalizedEmail: string,
  event: EngagementEvent,
  at: number
): Promise<void> {
  const contact = await findByNormalizedEmail(ctx, normalizedEmail);
  if (!contact) return;
  const ref = contactsRef(ctx).doc(contact.contactId);
  const base = { updatedAt: at };
  if (event === "REPLIED") {
    await ref.update({
      ...base,
      replyCount: FieldValue.increment(1),
      repliedAt: contact.repliedAt ?? at,
      lastRepliedAt: at,
      lastOutcome: "REPLIED",
    });
  } else if (event === "UNSUBSCRIBED") {
    await ref.update({
      ...base,
      unsubscribedAt: at,
      lastOutcome: "UNSUBSCRIBED",
      suppressed: true,
      suppressionReason: "UNSUBSCRIBED",
    });
  } else {
    await ref.update({
      ...base,
      bouncedAt: at,
      lastOutcome: "BOUNCED",
      ...(event === "BOUNCED_HARD"
        ? { suppressed: true, suppressionReason: "HARD_BOUNCE" }
        : {}),
    });
  }
}

/** Reverse a mistaken unsubscribe on the contact: clear the suppression
 * mirror and count the message as the real reply it was. */
export async function undoContactUnsubscribe(
  ctx: Scope,
  normalizedEmail: string,
  at: number
): Promise<void> {
  const contact = await findByNormalizedEmail(ctx, normalizedEmail);
  if (!contact) return;
  await contactsRef(ctx).doc(contact.contactId).update({
    suppressed: false,
    suppressionReason: null,
    unsubscribedAt: null,
    replyCount: FieldValue.increment(1),
    repliedAt: contact.repliedAt ?? at,
    lastRepliedAt: at,
    lastOutcome: "REPLIED",
    updatedAt: at,
  });
}

/** Overwrite a contact's engagement fields with authoritative rolled-up
 * values (used by the reconcile sweep: recipient records win). */
export async function setContactEngagement(
  ctx: Scope,
  contactId: string,
  e: ContactEngagement
): Promise<void> {
  await contactsRef(ctx)
    .doc(contactId)
    .update({
      emailsSentCount: e.emailsSentCount,
      replyCount: e.replyCount,
      repliedAt: e.repliedAt,
      lastRepliedAt: e.lastRepliedAt,
      bouncedAt: e.bouncedAt,
      unsubscribedAt: e.unsubscribedAt,
      lastOutcome: e.lastOutcome,
      ...(e.unsubscribedAt !== null
        ? { suppressed: true, suppressionReason: "UNSUBSCRIBED" }
        : e.hardBounced
          ? { suppressed: true, suppressionReason: "HARD_BOUNCE" }
          : {}),
      updatedAt: Date.now(),
    })
    .catch(() => {
      // Contact deleted since the campaign ran: ignore.
    });
}

function parseSourceTimestamp(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value.replace(",", ""));
  return Number.isFinite(t) ? t : null;
}

/**
 * Upsert a parsed lead as a contact (dedup key: normalized email).
 * Returns the contact plus whether it already existed.
 */
export async function upsertFromParsedLead(
  ctx: Scope,
  lead: ParsedLead,
  importId: string,
  consent: { basis: ConsentBasis; note: string } = {
    basis: "UNKNOWN",
    note: "",
  }
): Promise<{ contact: Contact; existed: boolean }> {
  if (!lead.email || !lead.emailValid) {
    throw new Error("Cannot import a lead without a valid email");
  }
  const now = Date.now();
  const normalizedEmail = normalizeEmail(lead.email);
  const existing = await findByNormalizedEmail(ctx, normalizedEmail);

  if (existing) {
    const ref = contactsRef(ctx).doc(existing.contactId);
    /**
     * A re-import fills in a missing basis but never overwrites a recorded one.
     * The asymmetry is deliberate: a declared basis is the evidence you would
     * produce if challenged, and a later bulk import, where one choice covers
     * a whole file, is weaker evidence than whatever was recorded the first
     * time. Upgrading UNKNOWN is pure gain; clobbering CONSENT with a blanket
     * "business research" would quietly destroy the stronger record.
     */
    const adoptsBasis = existing.consentBasis === "UNKNOWN" && consent.basis !== "UNKNOWN";
    await ref.update({
      lastSeenAt: now,
      updatedAt: now,
      // Refresh volatile source fields; history fields are preserved.
      phone: lead.phone ?? existing.phone,
      normalizedPhone: lead.phone ? normalizePhone(lead.phone) : existing.normalizedPhone,
      requestedAmount: lead.requestedAmount ?? existing.requestedAmount,
      emailOptOut: lead.emailOptOut ?? existing.emailOptOut,
      sourceUpdatedAt: parseSourceTimestamp(lead.sourceUpdatedAt) ?? existing.sourceUpdatedAt,
      ...(adoptsBasis
        ? {
            consentBasis: consent.basis,
            consentNote: consent.note,
            consentRecordedAt: now,
          }
        : {}),
    });
    return {
      contact: adoptsBasis
        ? {
            ...existing,
            consentBasis: consent.basis,
            consentNote: consent.note,
            consentRecordedAt: now,
          }
        : existing,
      existed: true,
    };
  }

  const contactId = crypto.randomUUID();
  const contact: Contact = ContactSchema.parse({
    contactId,
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    normalizedEmail,
    email: lead.email,
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    businessName: lead.businessName,
    normalizedBusinessName: normalizeBusinessName(lead.businessName),
    phone: lead.phone ?? "",
    normalizedPhone: lead.phone ? normalizePhone(lead.phone) : "",
    region: lead.region ?? "",
    requestedAmount: lead.requestedAmount,
    leadSource: lead.leadSource ?? "",
    consentBasis: consent.basis,
    consentNote: consent.note,
    consentRecordedAt: consent.basis === "UNKNOWN" ? null : now,
    sourceCreatedAt: parseSourceTimestamp(lead.sourceCreatedAt),
    sourceUpdatedAt: parseSourceTimestamp(lead.sourceUpdatedAt),
    sourceRecordId: lead.sourceRecordId,
    emailOptOut: lead.emailOptOut ?? false,
    neverSwitchedFromNew: lead.neverSwitchedFromNew,
    rawSource: lead.rawText,
    importId,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await contactsRef(ctx).doc(contactId).create(contact);
  return { contact, existed: false };
}

/** Total number of leads this user has (cheap aggregate count). */
export async function countContacts(ctx: Scope): Promise<number> {
  const agg = await contactsRef(ctx).count().get();
  return agg.data().count;
}

/**
 * How many contacts have no recorded lawful basis, and how many exist at all.
 *
 * Counted by subtraction rather than by querying for UNKNOWN, and the reason is
 * a Firestore property that would otherwise make this quietly wrong. Contacts
 * written before `consentBasis` existed do not hold the field at all, and a
 * document missing a field matches no equality filter on it: not `== UNKNOWN`,
 * not `!= LEGITIMATE_INTEREST`, nothing. Querying for the unrecorded ones
 * directly would therefore report zero on precisely the workspaces that have
 * the problem.
 *
 * Counting the recorded ones and subtracting inverts that: a missing field
 * fails the `in` filter, so it lands in the remainder where it belongs. Both
 * halves are aggregation queries, so this stays cheap on a large workspace.
 */
export async function consentCoverage(
  ctx: Scope
): Promise<{ total: number; recorded: number; unrecorded: number }> {
  const [totalAgg, recordedAgg] = await Promise.all([
    contactsRef(ctx).count().get(),
    contactsRef(ctx)
      .where("consentBasis", "in", [...SELECTABLE_CONSENT_BASES])
      .count()
      .get(),
  ]);
  const total = totalAgg.data().count;
  const recorded = recordedAgg.data().count;
  return { total, recorded, unrecorded: Math.max(0, total - recorded) };
}

/**
 * Record a lawful basis on contacts that have none, one page at a time.
 *
 * Paged rather than done in a single sweep because the set cannot be queried
 * for directly (see `consentCoverage`), so finding it means reading contacts
 * and filtering in memory: unbounded work on a large workspace, and a request
 * that would time out on exactly the accounts that need it most. The caller
 * repeats until `remaining` reaches zero, which is the same batching shape the
 * lead import already uses.
 *
 * Only ever fills a gap. A contact with a basis already recorded is skipped, so
 * running this twice cannot overwrite a stronger record with a blanket one.
 */
export async function recordConsentBasisForUnrecorded(
  ctx: Scope,
  basis: Exclude<ConsentBasis, "UNKNOWN">,
  note: string,
  cursor: string | null = null,
  pageSize = 200
): Promise<{ updated: number; scanned: number; cursor: string | null; done: boolean }> {
  /**
   * Ordered by document ID with a cursor, which is the part that makes this
   * terminate. Re-querying from the start each call would walk the same page
   * forever: the first page gets updated, the next call finds nothing left to
   * update *on that page*, and reporting "done" from that would stop the sweep
   * while every later page is still unrecorded. Ordering gives the pages a
   * stable sequence and the cursor advances through them exactly once.
   */
  let query = contactsRef(ctx).orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) query = query.startAfter(cursor);

  const snapshot = await query.get();
  const now = Date.now();

  const targets = snapshot.docs.filter((doc) => {
    const value = doc.data().consentBasis;
    return value === undefined || value === null || value === "UNKNOWN";
  });

  if (targets.length > 0) {
    const batch = firestore().batch();
    for (const doc of targets) {
      batch.update(doc.ref, {
        consentBasis: basis,
        consentNote: note,
        consentRecordedAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  // A short page is the last page: only exhausting the collection ends the
  // sweep, never the contents of any single page.
  const done = snapshot.size < pageSize;

  return {
    updated: targets.length,
    scanned: snapshot.size,
    cursor: done ? null : (snapshot.docs[snapshot.docs.length - 1]?.id ?? null),
    done,
  };
}

/** Contacts belonging to a lead list. Uses the automatic array-contains
 * index and sorts in memory (lists are bounded per user). */
export async function listContactsInList(
  ctx: Scope,
  listId: string,
  limit = 2000
): Promise<Contact[]> {
  const snap = await contactsRef(ctx).where("listIds", "array-contains", listId).limit(limit).get();
  return snap.docs
    .map((d) => ContactSchema.parse(d.data()))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function countContactsInList(ctx: Scope, listId: string): Promise<number> {
  const agg = await contactsRef(ctx).where("listIds", "array-contains", listId).count().get();
  return agg.data().count;
}

/** Add a contact to a list unless it is already a member. Returns true only
 * when it was genuinely new, so callers can count fresh additions. */
export async function addContactToList(
  ctx: Scope,
  contactId: string,
  listId: string,
  alreadyMember: boolean
): Promise<boolean> {
  if (alreadyMember) return false;
  await contactsRef(ctx)
    .doc(contactId)
    .update({ listIds: FieldValue.arrayUnion(listId), updatedAt: Date.now() })
    .catch(() => {});
  return true;
}

/** Remove a single contact from a list. */
export async function removeContactFromList(ctx: Scope, contactId: string, listId: string): Promise<void> {
  await contactsRef(ctx)
    .doc(contactId)
    .update({ listIds: FieldValue.arrayRemove(listId), updatedAt: Date.now() });
}

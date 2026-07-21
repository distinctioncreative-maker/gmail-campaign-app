import "server-only";
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
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

/**
 * All contact access is scoped by the verified AuthContext. The owner's
 * user ID is part of the document path (users/{uid}/contacts), so a
 * query can never cross into another user's data.
 */

function contactsRef(ctx: Scope) {
  return firestore().collection("users").doc(ctx.userId).collection("contacts");
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

export async function getContact(
  ctx: Scope,
  contactId: string
): Promise<Contact | null> {
  const snap = await contactsRef(ctx).doc(contactId).get();
  return snap.exists ? ContactSchema.parse(snap.data()) : null;
}

/**
 * Mark a contact as actually contacted — called when an email is genuinely
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
      // Contact may have been deleted between launch and send — ignore.
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
  await contactsRef(ctx).doc(contactId).update(update);
}

/** Permanently delete a lead. Campaign snapshots are unaffected (they carry
 * their own copies), so history stays intact. */
export async function deleteContact(ctx: Scope, contactId: string): Promise<void> {
  await contactsRef(ctx).doc(contactId).delete();
}

/** Count one genuinely sent email (initial or follow-up) on the contact. */
export async function recordEmailSent(ctx: Scope, contactId: string, at: number): Promise<void> {
  await contactsRef(ctx)
    .doc(contactId)
    .update({ emailsSentCount: FieldValue.increment(1), lastOutcome: "EMAILED", updatedAt: at })
    .catch(() => {
      // Contact may have been deleted after launch — ignore.
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

/** Overwrite a contact's engagement fields with authoritative rolled-up
 * values (used by the reconcile sweep — recipient records win). */
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
      // Contact deleted since the campaign ran — ignore.
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
  importId: string
): Promise<{ contact: Contact; existed: boolean }> {
  if (!lead.email || !lead.emailValid) {
    throw new Error("Cannot import a lead without a valid email");
  }
  const now = Date.now();
  const normalizedEmail = normalizeEmail(lead.email);
  const existing = await findByNormalizedEmail(ctx, normalizedEmail);

  if (existing) {
    const ref = contactsRef(ctx).doc(existing.contactId);
    await ref.update({
      lastSeenAt: now,
      updatedAt: now,
      // Refresh volatile source fields; history fields are preserved.
      phone: lead.phone ?? existing.phone,
      normalizedPhone: lead.phone ? normalizePhone(lead.phone) : existing.normalizedPhone,
      requestedAmount: lead.requestedAmount ?? existing.requestedAmount,
      emailOptOut: lead.emailOptOut ?? existing.emailOptOut,
      sourceUpdatedAt: parseSourceTimestamp(lead.sourceUpdatedAt) ?? existing.sourceUpdatedAt,
    });
    return { contact: existing, existed: true };
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

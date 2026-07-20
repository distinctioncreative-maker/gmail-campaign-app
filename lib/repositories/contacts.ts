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

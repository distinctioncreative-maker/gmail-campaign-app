import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey, ApiKeyError } from "@/lib/auth/requireApiKey";
import { firestore } from "@/lib/firebase/admin";
import { ContactSchema } from "@/schemas/contact";
import { reportError } from "@/lib/observability/report";
import { enforceRateLimit } from "@/lib/util/rateLimit";
import { normalizeEmail } from "@/lib/parser/normalize";
import { SELECTABLE_CONSENT_BASES } from "@/lib/compliance/consent";

/**
 * The public leads API.
 *
 * `/api/v1/` is a separate namespace from `/api/` on purpose. Everything under
 * `/api/` is the app talking to itself and may change shape whenever the UI
 * does; anything under `/api/v1/` is a promise to somebody else's code, and the
 * version in the path is what lets that promise be kept while the internal
 * routes keep moving.
 *
 * Every read and write is scoped by the owner recorded on the key, not by the
 * organization id. Leads live under users/{userId}, so scoping by organization
 * would address a document that does not exist and write to a subtree the app
 * never reads. The owner is stored separately from the key's creator precisely
 * so a workspace can reassign the integration when that person leaves.
 */

export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (err instanceof ApiKeyError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    // Field-level detail, because the caller is a developer debugging their own
    // request and "invalid body" wastes their afternoon.
    return NextResponse.json(
      {
        error: "The request body is not valid.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }
  reportError(err, { scope: "api-v1-leads" });
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}

/** Bounded so a paging integration cannot pull a whole workspace in one call. */
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireApiKey(req, "leads:read");
    // Keyed on the key rather than a user, so one noisy integration cannot
    // spend another's allowance.
    const allowed = await enforceRateLimit("api-v1", ctx.keyId, 600, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. This key allows 600 requests an hour." },
        { status: 429 }
      );
    }

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 25)
    );
    const cursor = req.nextUrl.searchParams.get("cursor");

    let query = firestore()
      .collection("users")
      .doc(ctx.ownerUserId)
      .collection("contacts")
      .orderBy("createdAt", "desc")
      .limit(limit + 1);
    if (cursor) {
      const at = Number(cursor);
      if (Number.isFinite(at)) query = query.startAfter(at);
    }

    const snap = await query.get();
    const rows = snap.docs.slice(0, limit).map((doc) => ContactSchema.parse(doc.data()));
    const last = rows[rows.length - 1];
    return NextResponse.json({
      data: rows.map((c) => ({
        id: c.contactId,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        businessName: c.businessName,
        phone: c.phone,
        optedOut: c.emailOptOut,
        campaignCount: c.campaignCount,
        lastOutcome: c.lastOutcome,
        createdAt: new Date(c.firstSeenAt).toISOString(),
      })),
      // Opaque to the caller, so the cursor shape can change without breaking them.
      nextCursor: snap.size > limit && last ? String(last.createdAt) : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().max(120).default(""),
  lastName: z.string().trim().max(120).default(""),
  businessName: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  /**
   * Why the caller may email this person. Optional, and deliberately not
   * defaulted to a real basis: inventing one on the integration's behalf would
   * manufacture a compliance record nobody actually asserted. Omitting it
   * leaves the contact UNKNOWN, where the compliance screen surfaces it as
   * needing an answer rather than letting it pass silently.
   */
  consentBasis: z.enum(SELECTABLE_CONSENT_BASES).optional(),
  consentNote: z.string().trim().max(300).default(""),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireApiKey(req, "leads:write");
    const allowed = await enforceRateLimit("api-v1", ctx.keyId, 600, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. This key allows 600 requests an hour." },
        { status: 429 }
      );
    }

    const input = CreateSchema.parse(await req.json());
    const normalizedEmail = normalizeEmail(input.email);
    const contacts = firestore()
      .collection("users")
      .doc(ctx.ownerUserId)
      .collection("contacts");

    // Idempotent on the address. An integration retrying a timed-out POST must
    // not create a duplicate lead, and dedupe on email is what the CSV import
    // already does, so the API behaving differently would be the surprise.
    const existing = await contacts.where("normalizedEmail", "==", normalizedEmail).limit(1).get();
    if (!existing.empty) {
      const found = ContactSchema.parse(existing.docs[0].data());
      return NextResponse.json(
        { data: { id: found.contactId, email: found.email, created: false } },
        { status: 200 }
      );
    }

    const now = Date.now();
    const contactId = crypto.randomUUID();
    const contact = ContactSchema.parse({
      contactId,
      ownerUserId: ctx.ownerUserId,
      organizationId: ctx.organizationId,
      normalizedEmail,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName: [input.firstName, input.lastName].filter(Boolean).join(" "),
      businessName: input.businessName,
      normalizedBusinessName: input.businessName.trim().toLowerCase(),
      phone: input.phone,
      leadSource: "API",
      consentBasis: input.consentBasis ?? "UNKNOWN",
      consentNote: input.consentNote,
      consentRecordedAt: input.consentBasis ? now : null,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await contacts.doc(contactId).create(contact);

    return NextResponse.json(
      { data: { id: contactId, email: contact.email, created: true } },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

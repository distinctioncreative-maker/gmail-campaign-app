import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getContact, updateContactDetails, deleteContact } from "@/lib/repositories/contacts";
import { ContactPatchSchema } from "@/lib/leads/engagement";

type Params = { params: Promise<{ contactId: string }> };

/** Edit a lead's details (name, business, phone, region, amount, source,
 * notes, opt-out). Email is not editable — it's the dedup key. */
export const PATCH = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { contactId } = await params;
  const existing = await getContact(ctx, contactId);
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const patch = ContactPatchSchema.parse(await req.json());
  await updateContactDetails(ctx, contactId, patch);
  return NextResponse.json({ ok: true, message: "Lead updated." });
});

/** Permanently delete a lead. Campaign history is unaffected (snapshots). */
export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { contactId } = await params;
  const existing = await getContact(ctx, contactId);
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  await deleteContact(ctx, contactId);
  return NextResponse.json({ ok: true, message: "Lead deleted." });
});

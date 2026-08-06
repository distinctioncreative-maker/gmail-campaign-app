import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import {
  bulkDeleteContacts,
  bulkSetOptOut,
  bulkUpdateContactList,
  bulkUpdateContactTags,
} from "@/lib/repositories/contacts";
import { getLeadList } from "@/lib/repositories/leadLists";
import { MAX_CONTACT_TAG_LENGTH, normalizeTagName } from "@/lib/leads/tags";

const ContactIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(2000)
  .transform((ids) => [...new Set(ids)]);
const TagSchema = z.string().trim().min(1).max(MAX_CONTACT_TAG_LENGTH).transform(normalizeTagName);
const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), contactIds: ContactIdsSchema }),
  z.object({ action: z.literal("optout"), contactIds: ContactIdsSchema }),
  z.object({ action: z.literal("allow"), contactIds: ContactIdsSchema }),
  z.object({ action: z.literal("add_tag"), contactIds: ContactIdsSchema, tag: TagSchema }),
  z.object({ action: z.literal("remove_tag"), contactIds: ContactIdsSchema, tag: TagSchema }),
  z.object({ action: z.literal("add_to_list"), contactIds: ContactIdsSchema, listId: z.string().min(1) }),
  z.object({ action: z.literal("remove_from_list"), contactIds: ContactIdsSchema, listId: z.string().min(1) }),
]);

/** Bulk lead operations, scoped to the signed-in user's own document path. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.contactBulk);
  const body = BodySchema.parse(await req.json());
  const { action, contactIds } = body;

  if (action === "delete") {
    const n = await bulkDeleteContacts(ctx, contactIds);
    return NextResponse.json({ ok: true, message: `Deleted ${n} lead${n === 1 ? "" : "s"}.` });
  }

  if (action === "add_tag" || action === "remove_tag") {
    const adding = action === "add_tag";
    const n = await bulkUpdateContactTags(ctx, contactIds, body.tag, adding ? "add" : "remove");
    return NextResponse.json({
      ok: true,
      message:
        n === 0
          ? `No leads changed. “${body.tag}” may already be ${adding ? "assigned" : "absent"}.`
          : `${adding ? "Added" : "Removed"} “${body.tag}” ${adding ? "to" : "from"} ${n} lead${n === 1 ? "" : "s"}.`,
    });
  }

  if (action === "add_to_list" || action === "remove_from_list") {
    const list = await getLeadList(ctx, body.listId);
    if (!list) return NextResponse.json({ error: "Lead list not found." }, { status: 404 });
    const adding = action === "add_to_list";
    const n = await bulkUpdateContactList(ctx, contactIds, body.listId, adding ? "add" : "remove");
    return NextResponse.json({
      ok: true,
      message:
        n === 0
          ? `No leads changed. They may already be ${adding ? "in" : "outside"} “${list.name}”.`
          : `${adding ? "Added" : "Removed"} ${n} lead${n === 1 ? "" : "s"} ${adding ? "to" : "from"} “${list.name}”.`,
    });
  }

  const optOut = action === "optout";
  const n = await bulkSetOptOut(ctx, contactIds, optOut);
  return NextResponse.json({
    ok: true,
    message: optOut
      ? `Marked ${n} lead${n === 1 ? "" : "s"} Do Not Email.`
      : `${n} lead${n === 1 ? "" : "s"} can be emailed again.`,
  });
});

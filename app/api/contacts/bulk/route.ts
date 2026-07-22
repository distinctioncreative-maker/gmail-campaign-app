import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { bulkDeleteContacts, bulkSetOptOut } from "@/lib/repositories/contacts";

const BodySchema = z.object({
  action: z.enum(["delete", "optout", "allow"]),
  contactIds: z.array(z.string().min(1)).min(1).max(2000),
});

/** Bulk lead operations — delete or toggle Do-Not-Email for many at once.
 * Scoped to the signed-in user's own contacts by document path. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { action, contactIds } = BodySchema.parse(await req.json());

  if (action === "delete") {
    const n = await bulkDeleteContacts(ctx, contactIds);
    return NextResponse.json({ ok: true, message: `Deleted ${n} lead${n === 1 ? "" : "s"}.` });
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

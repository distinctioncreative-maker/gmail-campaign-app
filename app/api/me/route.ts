import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { updateDisplayName } from "@/lib/repositories/users";

const PatchSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});

/** Update the signed-in user's own display name (shown on Team pages and
 * the account menu — never affects the email address emails send from). */
export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { displayName } = PatchSchema.parse(await req.json());
  await updateDisplayName(ctx.userId, displayName);
  return NextResponse.json({ ok: true, message: "Name updated." });
});

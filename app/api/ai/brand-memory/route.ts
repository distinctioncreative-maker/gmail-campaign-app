import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, updateOrgSettings } from "@/lib/repositories/orgSettings";

/** Read the org's AI brand memory. Any member can read it (the writer uses
 * it); `canEdit` tells the UI whether to show the editor. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  return NextResponse.json({
    brandContext: settings.aiBrandContext,
    canEdit: ctx.role === "ADMIN" || ctx.role === "MANAGER",
  });
});

const PutSchema = z.object({ brandContext: z.string().max(4000) });

/** Update the org's AI brand memory. Managers and admins only — it shapes
 * every AI email the whole team writes. */
export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN", "MANAGER");
  const { brandContext } = PutSchema.parse(await req.json());
  await updateOrgSettings(ctx.organizationId, { aiBrandContext: brandContext.trim() });
  return NextResponse.json({ ok: true, message: "Brand memory saved." });
});

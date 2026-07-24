import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, saveBrandProfiles } from "@/lib/repositories/orgSettings";

/** Read the org's brand-memory profiles. Any member can read them (to pick
 * one when writing); only admins can edit. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  return NextResponse.json({
    profiles: settings.aiBrandProfiles,
    canEdit: ctx.role === "ADMIN",
  });
});

const PutSchema = z.object({
  profiles: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(80),
        content: z.string().max(4000),
      })
    )
    .max(12),
});

/** Replace the org's brand-memory profiles. Admins only — they shape every
 * AI email the whole team writes. */
export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { profiles } = PutSchema.parse(await req.json());
  const saved = await saveBrandProfiles(
    ctx.organizationId,
    profiles.map((p) => ({ id: p.id ?? "", name: p.name, content: p.content }))
  );
  return NextResponse.json({ profiles: saved, message: "Brand memory saved." });
});

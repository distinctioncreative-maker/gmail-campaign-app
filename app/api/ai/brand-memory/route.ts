import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, saveBrandProfiles } from "@/lib/repositories/orgSettings";
import { BRAND_TONES, EMPTY_BRAND_VOICE } from "@/lib/ai/brandVoice";

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

const VoiceSchema = z.object({
  offer: z.string().max(600).default(""),
  audience: z.string().max(400).default(""),
  proof: z.string().max(600).default(""),
  tones: z.array(z.enum(BRAND_TONES)).max(BRAND_TONES.length).default([]),
  avoid: z.string().max(600).default(""),
});

const PutSchema = z.object({
  profiles: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(80),
        voice: VoiceSchema.default(() => EMPTY_BRAND_VOICE),
        /**
         * Free text that is not one of the structured questions. `content` is
         * deliberately not accepted from a client: it is compiled from the voice
         * on save, and letting a caller set it directly would allow the string
         * the model sees to disagree with the fields the person filled in.
         */
        notes: z.string().max(4000).default(""),
      })
    )
    .max(12),
});

/** Replace the org's brand-memory profiles. Admins only: they shape every
 * AI email the whole team writes. */
export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { profiles } = PutSchema.parse(await req.json());
  const saved = await saveBrandProfiles(
    ctx.organizationId,
    profiles.map((p) => ({
      id: p.id ?? "",
      name: p.name,
      voice: p.voice,
      notes: p.notes,
      // Recomputed by the repository from voice + notes; this value is ignored.
      content: "",
    }))
  );
  return NextResponse.json({ profiles: saved, message: "Brand memory saved." });
});

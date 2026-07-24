import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { generateEmail, AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { getOrgSettings, resolveBrandContext } from "@/lib/repositories/orgSettings";
import { env } from "@/lib/env";

const BodySchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
  profileId: z.string().nullable().optional(),
});

/** Whether AI writing is available, plus whether brand memory is set (so the
 * writer can nudge the user to add it). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  return NextResponse.json({
    enabled: Boolean(env.GEMINI_API_KEY),
    hasBrandMemory: settings.aiBrandProfiles.length > 0,
  });
});

/** Generate an email subject + body from a plain-language prompt, weaving in
 * the chosen brand-memory profile. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { prompt, profileId } = BodySchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  try {
    const email = await generateEmail(prompt, resolveBrandContext(settings, profileId));
    return NextResponse.json(email);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // Surface the real reason (e.g. a bad API key → 400) instead of a generic
    // 500, so the fix is obvious.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The AI writer failed. Please try again." },
      { status: 502 }
    );
  }
});

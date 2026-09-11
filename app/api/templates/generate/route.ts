import { NextRequest, NextResponse } from "next/server";
import { AiUnavailableError } from "@/lib/ai/gemini";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { generateEmail } from "@/lib/ai/generateEmail";
import { getOrgSettings, resolveBrandContext } from "@/lib/repositories/orgSettings";
import { aiWritingEnabled, assertAiWritingEnabled } from "@/lib/ai/enabled";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";

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
    enabled: aiWritingEnabled(settings),
    hasBrandMemory: settings.aiBrandProfiles.length > 0,
  });
});

/** Generate an email subject + body from a plain-language prompt, weaving in
 * the chosen brand-memory profile. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json({ error: "AI writing limit reached. Please try again later." }, { status: 429 });
  }
  const { prompt, profileId } = BodySchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  try {
    assertAiWritingEnabled(settings);
    const email = await generateEmail(prompt, resolveBrandContext(settings, profileId));
    return NextResponse.json(email);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // Everything the operator owns (key, billing, quota, model) is an
    // AiUnavailableError and was handled above with a message safe to show a
    // tenant. What is left is the caller's own request or a transient upstream
    // fault, where the real reason genuinely helps the person reading it.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The AI writer failed. Please try again." },
      { status: 502 }
    );
  }
});

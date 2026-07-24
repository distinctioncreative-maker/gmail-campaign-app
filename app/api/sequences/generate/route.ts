import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { generateSequence } from "@/lib/ai/generateSequence";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { env } from "@/lib/env";

const BodySchema = z.object({ prompt: z.string().trim().min(3).max(1000) });

/** Whether AI sequence drafting is available (show/hide the button). */
export const GET = handleApiErrors(async () => {
  await requireUser();
  return NextResponse.json({ enabled: Boolean(env.GEMINI_API_KEY) });
});

/** Draft a 2-3 step follow-up sequence from a plain-language prompt. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { prompt } = BodySchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  try {
    const result = await generateSequence({ prompt, brandContext: settings.aiBrandContext });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
});

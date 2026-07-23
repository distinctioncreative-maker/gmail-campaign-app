import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { generateEmail, AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { env } from "@/lib/env";

const BodySchema = z.object({ prompt: z.string().trim().min(3).max(1000) });

/** Whether AI writing is available (used to show/hide the button). */
export const GET = handleApiErrors(async () => {
  await requireUser();
  return NextResponse.json({ enabled: Boolean(env.GEMINI_API_KEY) });
});

/** Generate an email subject + body from a plain-language prompt. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  await requireUser();
  const { prompt } = BodySchema.parse(await req.json());
  try {
    const email = await generateEmail(prompt);
    return NextResponse.json(email);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
});

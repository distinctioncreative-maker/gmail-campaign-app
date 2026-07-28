import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { improveEmail } from "@/lib/ai/improveEmail";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { assertAiWritingEnabled } from "@/lib/ai/enabled";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";

const BodySchema = z.object({
  subject: z.string().max(300).default(""),
  html: z.string().min(1).max(20000),
  instruction: z.string().trim().min(2).max(200),
});

/** Rewrite the current email per a plain instruction (shorter, warmer, etc.). */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json({ error: "AI writing limit reached. Please try again later." }, { status: 429 });
  }
  const input = BodySchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  try {
    assertAiWritingEnabled(settings);
    const result = await improveEmail({ ...input, brandContext: settings.aiBrandContext });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
});

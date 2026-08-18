import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { addVariations, VariationRejected } from "@/lib/ai/addVariations";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { getOrgSettings, resolveBrandContext } from "@/lib/repositories/orgSettings";
import { assertAiWritingEnabled } from "@/lib/ai/enabled";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";

const BodySchema = z.object({
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(100_000),
  profileId: z.string().nullable().optional(),
});

/**
 * Add spintax variations to an email the user already wrote.
 *
 * Returns the varied copy for review; it does not save. The editor puts it in
 * the fields and the writer saves as they normally would, so this cannot change
 * a live template on its own.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json(
      { error: "AI writing limit reached. Please try again later." },
      { status: 429 }
    );
  }
  const { subject, html, profileId } = BodySchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);

  try {
    assertAiWritingEnabled(settings);
    const result = await addVariations(subject, html, resolveBrandContext(settings, profileId));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof VariationRejected) {
      // The model returned something that failed verification. That is an
      // ordinary outcome worth retrying, not a server fault, and the reason is
      // written for the person who pressed the button.
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The AI had a problem. Please try again." },
      { status: 502 }
    );
  }
});

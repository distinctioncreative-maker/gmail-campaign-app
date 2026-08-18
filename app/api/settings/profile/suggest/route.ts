import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";
import { aiWritingEnabled } from "@/lib/ai/enabled";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { fetchPageText } from "@/lib/net/fetchPage";
import { suggestSenderIdentity } from "@/lib/ai/suggestSenderIdentity";

const RequestSchema = z.object({ url: z.string().trim().min(3).max(500) });

/**
 * Read a company website and propose the sender-profile details it publishes.
 *
 * Any member, unlike the brand-memory equivalent, which is admin-only. Brand
 * memory shapes every email the whole team writes; a sender profile is one
 * person's own name, company, and footer, so the person filling it in is
 * exactly the person entitled to change it.
 *
 * Proposes only. The response goes into the form fields for review and the
 * normal save writes them, so nothing here can alter a profile on its own.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();

  const settings = await getOrgSettings(ctx.organizationId);
  if (!aiWritingEnabled(settings)) {
    return NextResponse.json(
      { error: "AI is turned off for this workspace." },
      { status: 403 }
    );
  }
  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json(
      { error: "You've used this a lot in the last hour. Try again shortly." },
      { status: 429 }
    );
  }

  const { url } = RequestSchema.parse(await req.json());

  const page = await fetchPageText(url);
  if (!page.ok) {
    return NextResponse.json({ error: page.reason }, { status: 422 });
  }

  const suggestion = await suggestSenderIdentity(page.text, page.url);
  return NextResponse.json({ ...suggestion, readFrom: page.url });
});

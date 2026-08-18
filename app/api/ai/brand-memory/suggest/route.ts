import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";
import { aiWritingEnabled } from "@/lib/ai/enabled";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { fetchPageText } from "@/lib/net/fetchPage";
import { suggestBrandVoice } from "@/lib/ai/suggestBrandVoice";

const RequestSchema = z.object({ url: z.string().trim().min(3).max(500) });

/**
 * Read a company website and propose its brand voice.
 *
 * Admin-only, matching the PUT on the parent route: brand memory shapes every AI
 * email the whole team writes, so who may change it and who may generate a
 * proposal for it are the same question.
 *
 * Nothing is saved here. The response is a proposal the admin sees, edits, and
 * then saves through the normal PUT. An endpoint that fetched a page and quietly
 * rewrote the workspace's brand memory would be a much larger action than the
 * button that triggers it appears to be.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");

  const settings = await getOrgSettings(ctx.organizationId);
  if (!aiWritingEnabled(settings)) {
    return NextResponse.json(
      { error: "AI writing is turned off for this workspace." },
      { status: 403 }
    );
  }
  // Shares the interactive AI budget. This call costs more than a draft (a page
  // fetch plus a generation), so it must not sit outside the limit.
  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json(
      { error: "You've used this a lot in the last hour. Try again shortly." },
      { status: 429 }
    );
  }

  const { url } = RequestSchema.parse(await req.json());

  const page = await fetchPageText(url);
  if (!page.ok) {
    // A site that cannot be read is an ordinary outcome rather than a server
    // fault, and the reason is written for the person who pasted the address.
    return NextResponse.json({ error: page.reason }, { status: 422 });
  }

  const suggestion = await suggestBrandVoice(page.text, page.url);
  return NextResponse.json({ ...suggestion, readFrom: page.url });
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getDraftContent, listRecentDrafts } from "@/lib/gmail/drafts";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

/** List recent Gmail drafts (id + subject + snippet) for template import. */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const drafts = await listRecentDrafts(ctx.userId, q);
  return NextResponse.json({ drafts });
});

const FetchSchema = z.object({ draftId: z.string().min(1) });

/** Fetch one draft's subject + sanitized HTML body for import. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { draftId } = FetchSchema.parse(await req.json());
  const content = await getDraftContent(ctx.userId, draftId);
  return NextResponse.json({
    draft: {
      ...content,
      htmlBody: sanitizeEmailHtml(content.htmlBody || `<p>${content.textBody}</p>`),
    },
  });
});

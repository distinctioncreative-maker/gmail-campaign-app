import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { renderForPreview } from "@/lib/personalization/preview";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

const BodySchema = z.object({
  subjectTemplate: z.string().min(1).max(500),
  htmlTemplate: z.string().min(1).max(500_000),
  contactId: z.string().nullable().optional(),
});

/** Render a personalized preview (fake data or a chosen contact). */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { subjectTemplate, htmlTemplate, contactId } = BodySchema.parse(await req.json());
  const rendered = await renderForPreview(
    ctx,
    subjectTemplate,
    sanitizeEmailHtml(htmlTemplate),
    contactId
  );
  return NextResponse.json(rendered);
});

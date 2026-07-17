import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/repositories/templates";
import { TemplateInputSchema } from "@/schemas/template";
import { findUnsupportedCss } from "@/lib/sanitize/html";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const templates = await listTemplates(ctx, { includeArchived: true });
  return NextResponse.json({ templates });
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = TemplateInputSchema.parse(await req.json());
  const template = await createTemplate(ctx, input);
  return NextResponse.json({
    template,
    cssWarnings: findUnsupportedCss(input.htmlTemplate),
  });
});

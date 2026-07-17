import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  duplicateTemplate,
  getTemplate,
  setTemplateActive,
  updateTemplate,
} from "@/lib/repositories/templates";
import { TemplateInputSchema } from "@/schemas/template";

type Params = { params: Promise<{ templateId: string }> };

export const GET = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { templateId } = await params;
  const template = await getTemplate(ctx, templateId);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ template });
});

export const PUT = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { templateId } = await params;
  const input = TemplateInputSchema.parse(await req.json());
  const template = await updateTemplate(ctx, templateId, input);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ template });
});

const ActionSchema = z.object({
  action: z.enum(["duplicate", "archive", "restore"]),
});

export const POST = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { templateId } = await params;
  const { action } = ActionSchema.parse(await req.json());

  if (action === "duplicate") {
    const copy = await duplicateTemplate(ctx, templateId);
    if (!copy) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ template: copy });
  }

  await setTemplateActive(ctx, templateId, action === "restore");
  return NextResponse.json({ ok: true });
});

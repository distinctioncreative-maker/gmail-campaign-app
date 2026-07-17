import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import type { AuthContext } from "@/lib/auth/requireUser";
import {
  TemplateSchema,
  type Template,
  type TemplateInput,
} from "@/schemas/template";
import { sanitizeEmailHtml, htmlToPlainText } from "@/lib/sanitize/html";

function templatesRef(ctx: AuthContext) {
  return firestore().collection("users").doc(ctx.userId).collection("templates");
}

export async function listTemplates(
  ctx: AuthContext,
  opts: { includeArchived?: boolean } = {}
): Promise<Template[]> {
  const snap = await templatesRef(ctx).orderBy("updatedAt", "desc").limit(200).get();
  const all = snap.docs.map((d) => TemplateSchema.parse(d.data()));
  return opts.includeArchived ? all : all.filter((t) => t.active);
}

export async function getTemplate(ctx: AuthContext, templateId: string): Promise<Template | null> {
  const snap = await templatesRef(ctx).doc(templateId).get();
  return snap.exists ? TemplateSchema.parse(snap.data()) : null;
}

/** Create a template. HTML is sanitized at the storage boundary. */
export async function createTemplate(ctx: AuthContext, input: TemplateInput): Promise<Template> {
  const now = Date.now();
  const templateId = crypto.randomUUID();
  const html = sanitizeEmailHtml(input.htmlTemplate);
  const template = TemplateSchema.parse({
    templateId,
    ownerUserId: ctx.userId,
    organizationId: ctx.organizationId,
    name: input.name,
    description: input.description,
    subjectTemplate: input.subjectTemplate,
    htmlTemplate: html,
    plainTextTemplate: htmlToPlainText(html),
    type: input.type,
    sourceGmailDraftId: input.sourceGmailDraftId ?? null,
    sourceGmailDraftSubject: input.sourceGmailDraftSubject ?? null,
    category: input.category,
    createdAt: now,
    updatedAt: now,
  });
  await templatesRef(ctx).doc(templateId).create(template);
  return template;
}

/** Update = new version. Previous content is kept in a versions subcollection. */
export async function updateTemplate(
  ctx: AuthContext,
  templateId: string,
  input: TemplateInput
): Promise<Template | null> {
  const existing = await getTemplate(ctx, templateId);
  if (!existing) return null;

  await templatesRef(ctx)
    .doc(templateId)
    .collection("versions")
    .doc(String(existing.version))
    .set({
      subjectTemplate: existing.subjectTemplate,
      htmlTemplate: existing.htmlTemplate,
      version: existing.version,
      savedAt: Date.now(),
    });

  const html = sanitizeEmailHtml(input.htmlTemplate);
  const updated = TemplateSchema.parse({
    ...existing,
    name: input.name,
    description: input.description,
    subjectTemplate: input.subjectTemplate,
    htmlTemplate: html,
    plainTextTemplate: htmlToPlainText(html),
    category: input.category,
    version: existing.version + 1,
    updatedAt: Date.now(),
  });
  await templatesRef(ctx).doc(templateId).set(updated);
  return updated;
}

export async function duplicateTemplate(
  ctx: AuthContext,
  templateId: string
): Promise<Template | null> {
  const existing = await getTemplate(ctx, templateId);
  if (!existing) return null;
  return createTemplate(ctx, {
    name: `${existing.name} (copy)`,
    description: existing.description,
    subjectTemplate: existing.subjectTemplate,
    htmlTemplate: existing.htmlTemplate,
    type: existing.type,
    category: existing.category,
  });
}

export async function setTemplateActive(
  ctx: AuthContext,
  templateId: string,
  active: boolean
): Promise<void> {
  await templatesRef(ctx).doc(templateId).update({ active, updatedAt: Date.now() });
}

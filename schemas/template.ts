import { z } from "zod";
import { EpochMillis } from "./common";

export const TemplateTypeSchema = z.enum([
  "VISUAL",
  "STARTER",
  "PASTED_HTML",
  "GMAIL_DRAFT",
]);

export const TemplateSchema = z.object({
  templateId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  subjectTemplate: z.string().min(1).max(500),
  htmlTemplate: z.string().min(1).max(500_000),
  plainTextTemplate: z.string().max(500_000).default(""),
  type: TemplateTypeSchema,
  sourceGmailDraftId: z.string().nullable().default(null),
  sourceGmailDraftSubject: z.string().nullable().default(null),
  category: z.string().max(100).default(""),
  active: z.boolean().default(true),
  version: z.number().int().positive().default(1),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  subjectTemplate: z.string().min(1).max(500),
  htmlTemplate: z.string().min(1).max(500_000),
  type: TemplateTypeSchema,
  sourceGmailDraftId: z.string().nullable().optional(),
  sourceGmailDraftSubject: z.string().nullable().optional(),
  category: z.string().max(100).default(""),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

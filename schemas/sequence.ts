import { z } from "zod";
import { EpochMillis } from "./common";

export const DelayUnitSchema = z.enum(["MINUTES", "HOURS", "DAYS", "BUSINESS_DAYS"]);

export const SequenceStepSchema = z.object({
  stepId: z.string().min(1),
  delayValue: z.number().int().min(0).max(365),
  delayUnit: DelayUnitSchema.default("BUSINESS_DAYS"),
  // How the follow-up's email body is chosen:
  //  SAME     → reuse the campaign's initial email
  //  TEMPLATE → use the saved template in templateId
  //  CUSTOM   → use customHtml written inline in the sequence builder
  bodyMode: z.enum(["SAME", "TEMPLATE", "CUSTOM"]).default("SAME"),
  templateId: z.string().nullable().default(null),
  customSubject: z.string().max(500).default(""),
  customHtml: z.string().max(500_000).default(""),
  subjectMode: z.enum(["KEEP", "RE", "CUSTOM"]).default("RE"),
  sameThread: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type SequenceStep = z.infer<typeof SequenceStepSchema>;

export const SequenceSchema = z.object({
  sequenceId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  active: z.boolean().default(true),
  stopOnReply: z.boolean().default(true),
  stopOnBounce: z.boolean().default(true),
  stopOnUnsubscribe: z.boolean().default(true),
  stopOnSuppression: z.boolean().default(true),
  outOfOfficePolicy: z.enum(["CONTINUE", "PAUSE_DAYS", "STOP"]).default("PAUSE_DAYS"),
  outOfOfficePauseDays: z.number().int().min(1).max(30).default(3),
  steps: z.array(SequenceStepSchema).max(10).default([]),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Sequence = z.infer<typeof SequenceSchema>;

export const SequenceInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  stopOnReply: z.boolean().default(true),
  stopOnBounce: z.boolean().default(true),
  stopOnUnsubscribe: z.boolean().default(true),
  outOfOfficePolicy: z.enum(["CONTINUE", "PAUSE_DAYS", "STOP"]).default("PAUSE_DAYS"),
  outOfOfficePauseDays: z.number().int().min(1).max(30).default(3),
  steps: z
    .array(
      SequenceStepSchema.omit({ stepId: true }).extend({
        stepId: z.string().optional(),
      })
    )
    .max(10),
});
export type SequenceInput = z.infer<typeof SequenceInputSchema>;

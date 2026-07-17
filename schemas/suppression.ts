import { z } from "zod";
import { EpochMillis } from "./common";

export const SuppressionScopeSchema = z.enum(["USER", "ORGANIZATION"]);
export const SuppressionReasonSchema = z.enum([
  "EMAIL_OPT_OUT",
  "UNSUBSCRIBED",
  "HARD_BOUNCE",
  "MANUAL",
  "INVALID",
  "COMPLAINT",
  "OTHER",
]);

export const SuppressionSchema = z.object({
  suppressionId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  normalizedEmail: z.string().min(3),
  email: z.string(),
  reason: SuppressionReasonSchema,
  scope: SuppressionScopeSchema,
  source: z.string().default("MANUAL"),
  campaignId: z.string().nullable().default(null),
  recipientId: z.string().nullable().default(null),
  active: z.boolean().default(true),
  details: z.string().default(""),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Suppression = z.infer<typeof SuppressionSchema>;

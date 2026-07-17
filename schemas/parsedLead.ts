import { z } from "zod";

/** One lead parsed from pasted Salesforce list text — pre-import shape. */
export const ParsedLeadSchema = z.object({
  index: z.number().int().nonnegative(),
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  businessName: z.string(),
  phone: z.string().nullable(),
  region: z.string().nullable(),
  requestedAmount: z.number().nullable(),
  email: z.string().nullable(),
  emailValid: z.boolean(),
  emailOptOut: z.boolean().nullable(),
  neverSwitchedFromNew: z.boolean().nullable(),
  leadSource: z.string().nullable(),
  sourceCreatedAt: z.string().nullable(),
  sourceUpdatedAt: z.string().nullable(),
  sourceRecordId: z.string().nullable(),
  rawText: z.string(),
  warnings: z.array(z.string()),
  /** 0–1: how confident the parser is that fields landed correctly. */
  confidence: z.number().min(0).max(1),
});
export type ParsedLead = z.infer<typeof ParsedLeadSchema>;

export const ParseResultSchema = z.object({
  leads: z.array(ParsedLeadSchema),
  totalRecords: z.number().int().nonnegative(),
  globalWarnings: z.array(z.string()),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

export const ParseRequestSchema = z.object({
  text: z.string().min(1).max(2_000_000),
});

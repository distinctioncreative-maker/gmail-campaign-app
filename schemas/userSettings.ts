import { z } from "zod";
import { EpochMillis } from "./common";

export const SendingDefaultsSchema = z.object({
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
  dailySendLimit: z.number().int().min(1).max(2000).default(100),
  emailsPerBatch: z.number().int().min(1).max(50).default(5),
  minDelaySeconds: z.number().int().min(1).max(600).default(5),
  maxDelaySeconds: z.number().int().min(1).max(600).default(10),
  interBatchDelayMinutes: z.number().min(0).max(240).default(2),
});
export type SendingDefaults = z.infer<typeof SendingDefaultsSchema>;

export const DEFAULT_SENDING: SendingDefaults = {
  allowedWeekdays: [1, 2, 3, 4, 5],
  sendWindowStart: "09:00",
  sendWindowEnd: "20:00",
  dailySendLimit: 100,
  emailsPerBatch: 5,
  minDelaySeconds: 5,
  maxDelaySeconds: 10,
  interBatchDelayMinutes: 2,
};

export const SenderProfileSchema = z.object({
  senderName: z.string().max(120).default(""),
  senderTitle: z.string().max(120).default(""),
  senderPhone: z.string().max(40).default(""),
  senderEmail: z.string().max(200).default(""),
  companyName: z.string().max(200).default(""),
  companyWebsite: z.string().max(300).default(""),
  physicalAddress: z.string().max(500).default(""),
  signature: z.string().max(5000).default(""),
  unsubscribeText: z
    .string()
    .max(1000)
    .default("If you'd prefer not to hear from me again, just reply and let me know."),
  timezone: z.string().default("America/New_York"),
  testEmailLooksGood: z.boolean().default(false),
  sendingDefaults: SendingDefaultsSchema.default(DEFAULT_SENDING),
  updatedAt: EpochMillis.optional(),
});
export type SenderProfile = z.infer<typeof SenderProfileSchema>;

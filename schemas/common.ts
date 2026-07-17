import { z } from "zod";

export const RoleSchema = z.enum(["SALES_REP", "MANAGER", "ADMIN"]);
export type Role = z.infer<typeof RoleSchema>;

export const IsoDate = z.string().datetime({ offset: true }).or(z.string().datetime());

/** Firestore documents store timestamps as epoch millis for portability. */
export const EpochMillis = z.number().int().nonnegative();

export const OwnedRecord = z.object({
  organizationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  createdByUserId: z.string().min(1),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type OwnedRecordFields = z.infer<typeof OwnedRecord>;

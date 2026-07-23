import { z } from "zod";
import { EpochMillis } from "./common";

/** A named collection of leads (e.g. "Alpine offers — all time") that a rep
 * keeps topping up. Membership lives as listIds[] on each contact; dedup is
 * automatic because contacts are unique by normalized email. */
export const LeadListSchema = z.object({
  listId: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(80),
  /** Denormalized member count, kept roughly in sync for fast display. */
  count: z.number().int().nonnegative().default(0),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type LeadList = z.infer<typeof LeadListSchema>;

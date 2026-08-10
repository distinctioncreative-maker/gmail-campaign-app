import { z } from "zod";
import { EpochMillis } from "./common";

/**
 * A named filter set for a table.
 *
 * Every visit to Leads started from the default filter, so anyone whose actual
 * job is "the untouched leads in the Northeast list" rebuilt that from four
 * controls every single time they opened the page.
 *
 * The filter payload is a flat map of strings rather than a typed shape per
 * surface. That is deliberate: the controls above a table change as the product
 * does, and a schema that named each one would turn adding a filter into a
 * migration. The cost is that a stored view can name a filter that no longer
 * exists, so applying one ignores keys it does not recognise rather than
 * failing, and that is tested.
 */
export const VIEW_SURFACES = ["LEADS", "CAMPAIGNS"] as const;
export const ViewSurfaceSchema = z.enum(VIEW_SURFACES);
export type ViewSurface = z.infer<typeof ViewSurfaceSchema>;

export const SavedViewSchema = z.object({
  viewId: z.string().min(1),
  ownerUserId: z.string().min(1),
  surface: ViewSurfaceSchema,
  name: z.string().trim().min(1).max(40),
  /** Control values, keyed by control name. Strings only: these come from
   * <select> and <input> elements and go straight back into them, and a
   * number that arrives as a string would compare unequal to itself. */
  filters: z.record(z.string(), z.string()).default({}),
  sortKey: z.string().max(40).default(""),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type SavedView = z.infer<typeof SavedViewSchema>;

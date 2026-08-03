import { describe, expect, it } from "vitest";
import {
  LEAD_IMPORT_BATCH_SIZE,
  batchLeadImport,
} from "@/lib/leads/importBatching";

describe("lead import batching", () => {
  it("accepts an unbounded total through bounded server requests", () => {
    const leads = Array.from({ length: 525 }, (_, index) => index);
    const batches = batchLeadImport(leads);
    expect(LEAD_IMPORT_BATCH_SIZE).toBe(200);
    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 125]);
    expect(batches.flat()).toEqual(leads);
  });
});

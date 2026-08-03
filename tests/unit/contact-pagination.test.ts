import { describe, expect, it } from "vitest";
import {
  CONTACT_PAGE_SIZE,
  decodeContactCursor,
  decodeCursorTrail,
  encodeContactCursor,
} from "@/lib/leads/contactPagination";

describe("contact directory pagination", () => {
  it("uses a bounded page size without imposing a total lead cap", () => {
    expect(CONTACT_PAGE_SIZE).toBe(250);
  });

  it("round-trips a stable Firestore cursor", () => {
    const cursor = { createdAt: 1_700_000_000_000, contactId: "contact-7" };
    expect(decodeContactCursor(encodeContactCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors and removes them from navigation history", () => {
    const good = encodeContactCursor({ createdAt: 10, contactId: "a" });
    expect(decodeContactCursor("not-json")).toBeNull();
    expect(decodeCursorTrail(`bad,${good}`)).toEqual([good]);
  });
});

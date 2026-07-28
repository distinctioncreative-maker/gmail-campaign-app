import { describe, expect, it } from "vitest";
import { notificationStableId } from "@/lib/repositories/notifications";

describe("notificationStableId", () => {
  it("deduplicates repeated event keys to one Firestore document", () => {
    const key = "tracked-open:campaign-1:recipient-1";

    expect(notificationStableId(key)).toBe(notificationStableId(key));
    expect(notificationStableId(key)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps different recipients isolated", () => {
    expect(notificationStableId("tracked-open:campaign-1:recipient-1")).not.toBe(
      notificationStableId("tracked-open:campaign-1:recipient-2")
    );
  });
});

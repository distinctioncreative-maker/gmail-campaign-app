import { describe, it, expect } from "vitest";
import { isAiAvailable } from "@/lib/ai/enabled";

describe("isAiAvailable", () => {
  it("is off unless BOTH a server key exists and an admin enabled it", () => {
    expect(isAiAvailable(false, false)).toBe(false);
    expect(isAiAvailable(true, false)).toBe(false); // key present, admin off
    expect(isAiAvailable(false, true)).toBe(false); // admin on, no key
    expect(isAiAvailable(true, true)).toBe(true);
  });
});

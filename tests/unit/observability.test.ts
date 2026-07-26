import { describe, it, expect } from "vitest";
import { errorSummary } from "@/lib/observability/report";

describe("errorSummary", () => {
  it("captures name, scope, and kind from an Error", () => {
    const s = errorSummary(new TypeError("boom"), { scope: "api" });
    expect(s.name).toBe("TypeError");
    expect(s.scope).toBe("api");
    expect(s.kind).toBe("TypeError");
    expect(s.message).toBe("boom");
    expect(typeof s.at).toBe("string");
  });

  it("truncates very long messages so logs can't be flooded", () => {
    const s = errorSummary(new Error("x".repeat(5000)));
    expect(s.message.length).toBe(300);
  });

  it("handles non-Error throwables safely", () => {
    const s = errorSummary("just a string", { scope: "worker" });
    expect(s.name).toBe("NonError");
    expect(s.message).toBe("just a string");
    expect(s.scope).toBe("worker");
  });
});

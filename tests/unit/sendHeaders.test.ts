import { describe, it, expect } from "vitest";
import { sanitizeHeaderValue } from "@/lib/gmail/send";

describe("sanitizeHeaderValue", () => {
  it("leaves a normal address untouched", () => {
    expect(sanitizeHeaderValue("owner@example.com")).toBe("owner@example.com");
  });

  it("strips CRLF so extra headers can't be injected", () => {
    const injected = "victim@example.com\r\nBcc: attacker@evil.com";
    const out = sanitizeHeaderValue(injected);
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe("victim@example.com Bcc: attacker@evil.com");
  });

  it("collapses bare newlines and trims", () => {
    expect(sanitizeHeaderValue("  Subject line\nsecond\r\n  ")).toBe("Subject line second");
  });
});

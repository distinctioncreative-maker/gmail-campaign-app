import { describe, expect, it } from "vitest";
import { buildMime } from "@/lib/gmail/send";

describe("Gmail MIME builder", () => {
  it("adds the RFC 8058 headers when a one-click URL is provided", () => {
    const mime = buildMime({
      to: "lead@example.com",
      subject: "Hello",
      htmlBody: "<p>Hello</p>",
      unsubscribeUrl: "https://cadence.example/api/u/signed-token",
    });
    expect(mime).toContain(
      "List-Unsubscribe: <https://cadence.example/api/u/signed-token>"
    );
    expect(mime).toContain(
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click"
    );
  });

  it("does not add opt-out headers without a server-generated URL", () => {
    const mime = buildMime({
      to: "lead@example.com",
      subject: "Hello",
      htmlBody: "<p>Hello</p>",
    });
    expect(mime).not.toContain("List-Unsubscribe:");
  });

  it("rejects non-web unsubscribe protocols", () => {
    expect(() =>
      buildMime({
        to: "lead@example.com",
        subject: "Hello",
        htmlBody: "<p>Hello</p>",
        unsubscribeUrl: "javascript:alert(1)",
      })
    ).toThrow("HTTP or HTTPS");
  });
});

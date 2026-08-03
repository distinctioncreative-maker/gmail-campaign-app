import { describe, expect, it } from "vitest";
import {
  appendMissingCommercialFooter,
  appendVisibleUnsubscribeLink,
  missingCommercialEmailPlaceholders,
} from "@/lib/campaigns/compliance";

describe("commercial email campaign compliance", () => {
  it("accepts a body with the mailing address and opt-out placeholders", () => {
    expect(
      missingCommercialEmailPlaceholders(
        "<p>Hello</p><p>{{physical_address}}</p><p>{{unsubscribe_text}}</p>"
      )
    ).toEqual([]);
  });

  it("reports every required placeholder that is missing", () => {
    expect(missingCommercialEmailPlaceholders("<p>Hello</p>")).toEqual([
      "physical_address",
      "unsubscribe_text",
    ]);
  });

  it("does not treat a similarly named or unknown placeholder as compliant", () => {
    expect(
      missingCommercialEmailPlaceholders(
        "<p>{{address}}</p><p>{{unsubscribe_url}}</p>"
      )
    ).toEqual(["physical_address", "unsubscribe_text"]);
  });

  it("adds only missing compliance placeholders without duplicating existing ones", () => {
    const html = appendMissingCommercialFooter(
      "<p>Hello</p><p>{{physical_address}}</p>"
    );
    expect(html.match(/\{\{physical_address\}\}/g)).toHaveLength(1);
    expect(html.match(/\{\{unsubscribe_text\}\}/g)).toHaveLength(1);
    expect(missingCommercialEmailPlaceholders(html)).toEqual([]);
  });

  it("adds a visible, untracked server-signed unsubscribe link", () => {
    const html = appendVisibleUnsubscribeLink(
      "<html><body><p>Hello</p></body></html>",
      "https://cadence.example/api/u/signed?a=1&b=2"
    );
    expect(html).toContain("Unsubscribe</a>");
    expect(html).toContain("a=1&amp;b=2");
    expect(html.indexOf("Unsubscribe</a>")).toBeLessThan(html.indexOf("</body>"));
  });

  it("rejects unsafe visible unsubscribe protocols", () => {
    expect(() =>
      appendVisibleUnsubscribeLink("<p>Hello</p>", "javascript:alert(1)")
    ).toThrow("HTTP or HTTPS");
  });
});

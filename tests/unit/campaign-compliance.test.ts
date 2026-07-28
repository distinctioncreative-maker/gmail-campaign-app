import { describe, expect, it } from "vitest";
import { missingCommercialEmailPlaceholders } from "@/lib/campaigns/compliance";

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
});

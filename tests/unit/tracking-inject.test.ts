import { describe, expect, it } from "vitest";
import { injectTracking } from "@/lib/tracking/inject";

const payload = {
  ownerUserId: "user-1",
  organizationId: "org-1",
  campaignId: "camp-1",
  recipientId: "recip-1",
  step: 0,
};
const BASE = "https://app.example.com";

describe("injectTracking", () => {
  it("rewrites a link and records its original URL by index", () => {
    const { html, linkUrls } = injectTracking(
      '<p><a href="https://example.com/pricing">Pricing</a></p>',
      payload,
      BASE
    );
    expect(linkUrls).toEqual(["https://example.com/pricing"]);
    expect(html).toContain(`${BASE}/api/t/c/`);
    expect(html).not.toContain("https://example.com/pricing");
  });

  it("appends an open pixel pointing at the app base URL", () => {
    const { html } = injectTracking("<p>Hi</p>", payload, BASE);
    expect(html).toContain(`<img src="${BASE}/api/t/o/`);
  });

  it("never rewrites mailto:, tel:, or anchor links", () => {
    const { html, linkUrls } = injectTracking(
      '<a href="mailto:a@b.com">Email</a><a href="tel:+15551234567">Call</a><a href="#top">Top</a>',
      payload,
      BASE
    );
    expect(linkUrls).toEqual([]);
    expect(html).toContain('href="mailto:a@b.com"');
    expect(html).toContain('href="tel:+15551234567"');
    expect(html).toContain('href="#top"');
  });

  it("never rewrites a link that is or mentions unsubscribe — opt-out must never depend on tracking", () => {
    const { html, linkUrls } = injectTracking(
      '<a href="https://example.com/unsubscribe?id=123">Unsubscribe</a>',
      payload,
      BASE
    );
    expect(linkUrls).toEqual([]);
    expect(html).toContain('href="https://example.com/unsubscribe?id=123"');
  });

  it("indexes multiple links in document order", () => {
    const { linkUrls, html } = injectTracking(
      '<a href="https://a.example.com">A</a><a href="https://b.example.com">B</a>',
      payload,
      BASE
    );
    expect(linkUrls).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(html.indexOf("/c/")).toBeLessThan(html.lastIndexOf("/c/"));
  });
});

import { describe, expect, it } from "vitest";
import {
  describeTracking,
  resolveTracking,
  tracksAnything,
} from "@/lib/tracking/settings";
import { injectTracking } from "@/lib/tracking/inject";
import { CampaignSchema } from "@/schemas/campaign";

describe("resolveTracking", () => {
  it("defaults both off for a campaign that set neither", () => {
    expect(resolveTracking({})).toEqual({ opens: false, clicks: false });
    expect(tracksAnything({})).toBe(false);
  });

  it("honours each flag independently", () => {
    expect(resolveTracking({ openTrackingEnabled: true, clickTrackingEnabled: false })).toEqual({
      opens: true,
      clicks: false,
    });
    expect(resolveTracking({ openTrackingEnabled: false, clickTrackingEnabled: true })).toEqual({
      opens: false,
      clicks: true,
    });
  });

  it("falls back to the old flag for campaigns written before the split", () => {
    // Reading a missing new field as "off" would silently stop tracking on
    // running campaigns whose owners deliberately turned it on.
    expect(resolveTracking({ trackingEnabled: true })).toEqual({ opens: true, clicks: true });
    expect(resolveTracking({ trackingEnabled: false })).toEqual({ opens: false, clicks: false });
  });

  it("lets a new flag override the legacy one", () => {
    expect(
      resolveTracking({ trackingEnabled: true, openTrackingEnabled: false })
    ).toEqual({ opens: false, clicks: true });
  });

  it("describes the combination in words", () => {
    expect(describeTracking({ openTrackingEnabled: true, clickTrackingEnabled: true })).toBe(
      "Opens and clicks"
    );
    expect(describeTracking({ clickTrackingEnabled: true })).toBe("Clicks only");
    expect(describeTracking({ openTrackingEnabled: true })).toBe("Opens only");
    expect(describeTracking({})).toBe("Off");
  });
});

describe("the schema keeps the legacy fallback reachable", () => {
  /** A campaign document as Firestore holds it from before the split: the old
   * flag on, neither new field present. */
  const legacyDoc = {
    campaignId: "c1",
    ownerUserId: "u1",
    organizationId: "o1",
    createdByUserId: "u1",
    name: "Q3 founders",
    status: "ACTIVE",
    schedule: {},
    trackingEnabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };

  it("leaves the new flags absent rather than defaulting them to false", () => {
    // This is the whole reason they are .optional() and not .default(false).
    // Every read goes through this schema, so a default would materialise
    // false here and resolveTracking could never tell "the owner chose off"
    // from "this field did not exist yet". The same Zod-default trap has
    // produced four separate bugs in this codebase already.
    const parsed = CampaignSchema.parse(legacyDoc);
    expect(parsed.openTrackingEnabled).toBeUndefined();
    expect(parsed.clickTrackingEnabled).toBeUndefined();
  });

  it("keeps tracking on for a campaign that had it on before the split", () => {
    expect(resolveTracking(CampaignSchema.parse(legacyDoc))).toEqual({
      opens: true,
      clicks: true,
    });
  });

  it("still reads a post-split campaign exactly as written", () => {
    const parsed = CampaignSchema.parse({
      ...legacyDoc,
      trackingEnabled: true,
      openTrackingEnabled: false,
      clickTrackingEnabled: true,
    });
    expect(resolveTracking(parsed)).toEqual({ opens: false, clicks: true });
  });
});

describe("injectTracking respects the choice", () => {
  const payload = {
    ownerUserId: "u1",
    organizationId: "o1",
    campaignId: "c1",
    recipientId: "r1",
    step: 0,
  };
  const html = '<html><body>Hi <a href="https://example.com/pricing">pricing</a></body></html>';
  const base = "https://app.example";

  it("adds nothing when both are off", () => {
    const out = injectTracking(html, payload, base, { opens: false, clicks: false });
    expect(out.html).toBe(html);
    expect(out.linkUrls).toEqual([]);
    expect(out.html).not.toContain("/api/t/o/");
    expect(out.html).not.toContain("/api/t/c/");
  });

  it("adds only the pixel for opens", () => {
    const out = injectTracking(html, payload, base, { opens: true, clicks: false });
    expect(out.html).toContain("/api/t/o/");
    expect(out.html).not.toContain("/api/t/c/");
    // The original link survives untouched.
    expect(out.html).toContain("https://example.com/pricing");
    expect(out.linkUrls).toEqual([]);
  });

  it("rewrites only the links for clicks", () => {
    const out = injectTracking(html, payload, base, { opens: false, clicks: true });
    expect(out.html).toContain("/api/t/c/");
    expect(out.html).not.toContain("/api/t/o/");
    expect(out.linkUrls).toEqual(["https://example.com/pricing"]);
  });

  it("never rewrites an opt-out link, however it is written", () => {
    // A legally required opt-out must never depend on a tracking redirect
    // working. The system link is appended after injection so it is never
    // seen here, but a hand-written one in the template body is.
    for (const withOptOut of [
      // Word in the href.
      '<body><a href="https://acme.com/unsubscribe">Leave</a></body>',
      // Word only in the visible label, href says nothing.
      '<body><a href="https://acme.com/preferences">Unsubscribe</a></body>',
      '<body><a href="https://acme.com/p">opt out</a></body>',
      '<body><a href="https://acme.com/p"><span>Stop receiving</span> these</a></body>',
    ]) {
      const out = injectTracking(withOptOut, payload, base, { opens: false, clicks: true });
      expect(out.html, withOptOut).not.toContain("/api/t/c/");
      expect(out.linkUrls, withOptOut).toEqual([]);
    }
  });

  it("still rewrites ordinary links in the same email", () => {
    const mixed =
      '<body><a href="https://acme.com/pricing">Pricing</a>' +
      '<a href="https://acme.com/p">Unsubscribe</a></body>';
    const out = injectTracking(mixed, payload, base, { opens: false, clicks: true });
    expect(out.linkUrls).toEqual(["https://acme.com/pricing"]);
  });
});

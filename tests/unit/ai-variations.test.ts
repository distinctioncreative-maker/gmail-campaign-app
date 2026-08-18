import { describe, expect, it } from "vitest";
import { verifyVariation } from "@/lib/ai/addVariations";
import { analyzeSpintax, expandSpintax } from "@/lib/personalization/spintax";

const ORIGINAL = {
  subject: "Quick question for {{business_name}}",
  html: "<p>Hi {{first_name}},</p><p>We help trade firms get working capital fast. Worth a chat?</p><p>{{signature}}</p>",
};

/** A well-behaved result: same words, same placeholders, spin groups added. */
const GOOD = {
  subject: "{Quick question|A quick question} for {{business_name}}",
  html: "<p>{Hi|Hello} {{first_name}},</p><p>We {help|work with} trade firms get working capital fast. {Worth a chat?|Open to a chat?}</p><p>{{signature}}</p>",
};

describe("verifying AI-written spintax", () => {
  it("accepts a result that varies wording and nothing else", () => {
    const verdict = verifyVariation(ORIGINAL, GOOD);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.groups).toBeGreaterThanOrEqual(4);
      // 2 * 2 * 2 * 2 across subject and body.
      expect(verdict.variants).toBe(16);
    }
  });

  it("rejects a result that turned a placeholder into a spin group", () => {
    /**
     * The failure this whole verification step exists for. Spintax and
     * placeholders share a brace, so a model inserting `|` characters into HTML
     * full of `{{first_name}}` will eventually produce `{{first|name}}`. That
     * parses as valid spintax, ships happily, and reaches a real recipient as a
     * mangled personalization field.
     */
    const mangled = {
      subject: ORIGINAL.subject,
      html: ORIGINAL.html.replace("{{first_name}}", "{{first|name}}"),
    };
    const verdict = verifyVariation(ORIGINAL, mangled);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/personalization/i);
  });

  it("rejects a result that dropped a placeholder entirely", () => {
    const dropped = {
      subject: ORIGINAL.subject,
      html: ORIGINAL.html.replace("<p>{{signature}}</p>", ""),
    };
    expect(verifyVariation(ORIGINAL, dropped).ok).toBe(false);
  });

  it("rejects unbalanced braces rather than shipping them", () => {
    const broken = {
      subject: ORIGINAL.subject,
      html: ORIGINAL.html.replace("<p>Hi", "<p>{Hi|Hello"),
    };
    const verdict = verifyVariation(ORIGINAL, broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/syntax/i);
  });

  it("rejects a result with no variations at all", () => {
    // Returning the input unchanged is a failure that would otherwise present as
    // success, with the writer left wondering what the button did.
    const verdict = verifyVariation(ORIGINAL, ORIGINAL);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/no variations/i);
  });

  it("rejects a rewrite wearing the costume of a variation", () => {
    /**
     * The model's most common unhelpful helpfulness: asked to vary wording, it
     * rewrites the email into something it considers better. The result is valid
     * spintax with intact placeholders, so every other check passes, and the
     * writer's approved copy is silently replaced.
     */
    const rewritten = {
      subject: "{Transform|Revolutionise} your business today for {{business_name}}",
      html: "<p>{Hi|Hello} {{first_name}},</p><p>{Are you tired of slow funding|Sick of waiting on banks}? Our award-winning platform has helped thousands of businesses unlock their full potential with industry-leading rates and world-class service that our customers consistently rate as exceptional across every measure we track. Book a demo today and discover what you have been missing all this time.</p><p>{{signature}}</p>",
    };
    const verdict = verifyVariation(ORIGINAL, rewritten);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/rewrote/i);
  });

  it("rejects a result that deleted most of the email", () => {
    const gutted = {
      subject: "{Hi|Hey} for {{business_name}}",
      html: "<p>{Hi|Hello} {{first_name}},</p><p>{{signature}}</p>",
    };
    expect(verifyVariation(ORIGINAL, gutted).ok).toBe(false);
  });
});

describe("what the verified result does at send time", () => {
  it("parses with the same parser the send path uses", () => {
    // The point of verifying with `analyzeSpintax` rather than a local check:
    // "it parsed during review" and "it will parse when sending" are then the
    // same statement instead of two separate hopes.
    expect(analyzeSpintax(`${GOOD.subject} ${GOOD.html}`).issues).toEqual([]);
  });

  it("gives one recipient one stable version, and different recipients different ones", () => {
    const a1 = expandSpintax(GOOD.html, "lead-a");
    const a2 = expandSpintax(GOOD.html, "lead-a");
    expect(a1).toBe(a2);

    // Across many seeds at 8 body combinations, seeing only one is effectively
    // impossible unless expansion is ignoring the seed.
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => expandSpintax(GOOD.html, `lead-${i}`))
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves placeholders untouched for the render step that follows", () => {
    const expanded = expandSpintax(GOOD.html, "lead-a");
    expect(expanded).toContain("{{first_name}}");
    expect(expanded).toContain("{{signature}}");
    // And no spin syntax survives into what gets sent.
    expect(expanded).not.toContain("|");
  });
});

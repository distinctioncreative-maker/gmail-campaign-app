import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** CSS with comments stripped, because these rules are about what renders. */
const css = readFileSync("components/marketing/landing.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/**
 * A rule that hides an element it did not mean to hide.
 *
 * `.brand > span > span:last-child { display: none }` was written to drop the
 * wordmark's optional descriptor on a narrow screen. Wordmark renders the
 * descriptor only when one is passed, and nothing on this page passes one, so
 * there was exactly one span and `:last-child` matched the name itself. Below
 * 520px the marketing page rendered with no wordmark at all, in the nav and in
 * the footer, and had done for as long as the rule existed.
 *
 * Nothing failed, and nothing could have: an element styled out of existence is
 * indistinguishable from one that was never meant to be there. It was found by
 * rendering the page at 390px and measuring, and the only reason it was worth
 * measuring is that a logo missing from a marketing page is the kind of thing
 * that never gets reported, it just quietly looks unfinished.
 *
 * `:last-child` used to hide an optional sibling is the shape of the bug: it
 * matches the only child when the optional one is absent. `:not(:first-child)`
 * is what was meant.
 */
describe("nothing hides an element by assuming a sibling exists", () => {
  it("checks a real stylesheet", () => {
    expect(css.length).toBeGreaterThan(20_000);
  });

  it("never hides a :last-child without requiring a sibling", () => {
    const offenders: string[] = [];
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display:\s*none/.test(body)) continue;
      if (!/:last-child/.test(selector)) continue;
      // Safe when the rule also requires the element not to be the only one.
      if (/:not\(:first-child\)|:nth-child/.test(selector)) continue;
      offenders.push(selector.trim().replace(/\s+/g, " ").slice(0, 80));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the wordmark out of every display:none rule", () => {
    // Non-vacuity, and the specific regression: the brand is the one element on
    // this page that must render at every width.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display:\s*none/.test(body)) continue;
      expect(selector, "a rule hides the brand").not.toMatch(/\.brand\b/);
    }
  });
});

/**
 * Touch targets on the public page.
 *
 * The footer links rendered 19px tall on a phone, under WCAG 2.5.8's 24px
 * minimum and well under the 44px the application already holds for its own
 * mobile navigation. They are inline text in a wrapped list, so the fix is
 * vertical padding with matching negative margin: the type stays where it is,
 * the hit area grows around it, and the row's rhythm does not move.
 */
describe("the public page is usable with a thumb", () => {
  it("enlarges every small inline target under a coarse pointer", () => {
    const block = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(block, "a coarse-pointer block must exist").toBeTruthy();
    for (const selector of [".brand", ".footerLinks a", ".workflowFoot a"]) {
      expect(block, selector).toContain(selector);
    }
    // 13px each side of a 19px line box clears 44px. 12px lands on 43 and was
    // measured doing exactly that.
    expect(block).toMatch(/padding-block:\s*13px/);
    expect(block).toMatch(/margin-block:\s*-13px/);
  });
});

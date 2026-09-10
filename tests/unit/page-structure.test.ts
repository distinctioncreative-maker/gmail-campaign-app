import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every dashboard page has a spine.
 *
 * `PageHeader` was built and adopted on all twelve screens. `Section`, its
 * counterpart, was never built, and the result was measurable: nine of twelve
 * pages rendered a title and then an undifferentiated stack of cards, with
 * nothing saying which of them belonged together. Settings stacked twelve of
 * them, mixing identity, billing, sending, API keys and account deletion at
 * identical visual weight.
 *
 * Two rules, both cheap to satisfy and both about structure rather than taste:
 * a page uses the vertical rhythm class, and a page with several top-level
 * blocks names its groups instead of piling them.
 */

/** Every page under the dashboard route group, at any depth. */
function findPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPages(path));
    else if (entry.name === "page.tsx") found.push(path);
  }
  return found;
}

const pages = findPages("app/(dashboard)");
const read = (file: string) => readFileSync(file, "utf8");

/** Comments describe intent, and one mentioning `card` is not a card. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("dashboard page structure", () => {
  it("finds the pages, so a bad glob cannot make this suite vacuous", () => {
    expect(pages.length).toBeGreaterThanOrEqual(20);
  });

  it("keeps every page on the shared vertical rhythm", () => {
    /**
     * Without `page-sections` a page invents its own gaps, which is how eight
     * of twelve ended up agreeing and four did not.
     */
    const offenders = pages.filter((file) => {
      const source = withoutComments(read(file));
      // A page that renders nothing of its own (a redirect or a pure wrapper)
      // has no rhythm to keep.
      if (!source.includes("PageHeader") && !source.includes("EntityHeader")) return false;
      return !source.includes("page-sections");
    });
    expect(offenders).toEqual([]);
  });

  it("names its groups once a page has more than three top-level blocks", () => {
    /**
     * The threshold is where a stack stops being readable. Three cards under a
     * title is a page. Twelve is a filing cabinet with no labels on the
     * drawers.
     */
    const offenders: string[] = [];
    for (const file of pages) {
      const source = withoutComments(read(file));
      if (!source.includes("page-sections")) continue;
      const cards = (source.match(/className="[^"]*\bcard\b/g) ?? []).length;
      const components = (source.match(/<[A-Z][A-Za-z]*Card\b/g) ?? []).length;
      const blocks = cards + components;
      if (blocks > 3 && !source.includes("<Section")) {
        offenders.push(`${file} (${blocks} blocks, no Section)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no hand-rolled section heading left", () => {
    /**
     * `.section-head` is the Section component's own flex row now, not a
     * margin to hang on an `<h2>`. A page applying it directly would get a
     * heading laid out as a two-column row with nothing in the second column.
     */
    const offenders = pages.filter((file) =>
      /<h2[^>]*className="[^"]*section-head/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });
});

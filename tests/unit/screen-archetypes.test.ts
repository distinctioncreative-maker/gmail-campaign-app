import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** Every dashboard route file, with its source. */
const pages = walk("app/(dashboard)").map(
  (path) => [path, readFileSync(path, "utf8")] as const
);

/**
 * A route is "about one thing" when its path carries a dynamic segment: the URL
 * names a specific campaign, lead, template or sequence rather than a
 * collection.
 */
const detailPages = pages.filter(([path]) => /\[[^\]]+\]/.test(path));
const indexPages = pages.filter(([path]) => !/\[[^\]]+\]/.test(path));

describe("screen archetypes", () => {
  it("found both kinds of route, so the checks below mean something", () => {
    expect(detailPages.length).toBeGreaterThanOrEqual(4);
    expect(indexPages.length).toBeGreaterThanOrEqual(10);
  });

  it("gives a screen about one thing a different header from a list", () => {
    /**
     * The measured reason this app read as plain: thirty screens, twenty-eight
     * of them the same three components. Every detail route rendered the exact
     * header an index route did, a back link and an h1, so a campaign mid-send, a
     * lead who had replied twice, and a draft template all opened identically.
     *
     * This is written as "detail routes that still use the index header", not as
     * a list of the four that were converted, so a fifth detail route added next
     * year has to make the same choice deliberately.
     */
    const usingIndexHeader = detailPages
      .filter(([, source]) => /<PageHeader\b/.test(source))
      .map(([path]) => path);

    // team/[userId] and its nested campaign route are drill-downs into another
    // person's list rather than pages about a single object, and admin routes
    // are operator tooling where the index header is the right call.
    const allowed = new Set([
      "app/(dashboard)/team/[userId]/page.tsx",
      "app/(dashboard)/team/[userId]/campaigns/[campaignId]/page.tsx",
    ]);
    expect(usingIndexHeader.filter((path) => !allowed.has(path))).toEqual([]);
  });

  it("keeps status out of the actions slot on detail screens", () => {
    /**
     * Both converted screens previously rendered their status pill as the last
     * child of `actions`, the slot reserved for buttons. That put the single most
     * decision-relevant fact on the page, whether a campaign is paused or a lead
     * has opted out, in the position a reader scans for things to click.
     *
     * EntityHeader has a dedicated `status` prop, so this checks the pills did
     * not simply move back.
     */
    for (const [path, source] of detailPages) {
      if (!/<EntityHeader\b/.test(source)) continue;
      const header = source.slice(source.indexOf("<EntityHeader"));
      const actions = header.match(/actions=\{([\s\S]*?)\n {6}\}/)?.[1] ?? "";
      expect(actions, `${path} keeps status pills out of actions`).not.toMatch(
        /bg-(?:success|warning|danger|info)-soft/
      );
    }
  });

  it("names the entity type rather than only its name", () => {
    // A screen reached from a search result or a shared link has to say what kind
    // of thing it is showing.
    for (const [path, source] of detailPages) {
      if (!/<EntityHeader\b/.test(source)) continue;
      expect(source, `${path} sets a kicker`).toMatch(/kicker="/);
    }
  });
});

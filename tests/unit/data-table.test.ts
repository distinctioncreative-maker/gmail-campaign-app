import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const files = [...walk("app"), ...walk("components")]
  .filter((path) => !path.includes("ui/DataTable"))
  .map((path) => [path, readFileSync(path, "utf8")] as const);

/**
 * The only `<table>` elements allowed to exist outside the shared shell.
 *
 * Both are the accessible data equivalent of a chart, rendered for screen
 * readers and for anyone who cannot read a shape. They are not data tables in
 * the product sense: no header chrome, no rows anyone hovers, no scrolling.
 * Routing them through a component built for the other kind would mean giving
 * that component options only these two would ever set.
 */
const NOT_A_DATA_TABLE = new Map([
  [
    "components/ui/charts/TrendChart.tsx",
    "The chart's text alternative, at chart type sizes and never interactive.",
  ],
  [
    "components/ui/charts/BarChart.tsx",
    "The chart's text alternative, at chart type sizes and never interactive.",
  ],
]);

describe("the shared table shell", () => {
  it("owns the chrome and not the columns", () => {
    /**
     * The duplication that justified this was in the chrome, not the columns:
     * `<table className="w-full text-left text-sm">` appeared fifteen times
     * identically, the same thead classes fourteen times, the same row
     * border-and-hover string seven times. The columns differ everywhere and
     * should.
     *
     * So `head` is a ReactNode rather than an array of strings. A column config
     * would have needed a render-prop escape hatch for sortable headers,
     * checkbox selection, inline meters, action menus and colspan empty states,
     * and the abstraction would have ended up larger than the tables it
     * replaced. Duplicated markup is cheaper than a wrong abstraction.
     */
    const source = readFileSync("components/ui/DataTable.tsx", "utf8");
    expect(source).toContain("head?: ReactNode");
    expect(source).not.toMatch(/columns\s*[:?]/);
    // The wrapper is the reason this exists: wide tables must scroll inside
    // themselves so the page body never scrolls sideways.
    expect(source).toContain("overflow-x-auto");
  });

  it("carries the chrome the hand-rolled tables needed, and nothing structural", () => {
    // Each of these was the recorded reason a real table stayed hand-rolled.
    // They are all chrome, which is why they belong here and a column config
    // does not.
    const source = readFileSync("components/ui/DataTable.tsx", "utf8");
    for (const option of ["stickyHeader", "maxHeight", "bodyClassName", "minWidth"]) {
      expect(source).toContain(`${option}`);
    }
    // A header row is optional, because a label-and-value list is a table for
    // alignment rather than for columns and inventing a header for it is worse
    // than leaving it out.
    expect(source).toContain("{head ? (");
    // Rest props reach the <tr>. Without this a row cannot carry the data-*
    // attributes a keyboard-navigation script reads, which is the single
    // reason TableRow had zero importers for as long as it existed.
    expect(source).toContain("...rest");
  });

  it("has displaced every hand-rolled shell", () => {
    /**
     * This used to look for the exact string
     * `<table className="w-full text-left text-sm">`, which six tables slipped
     * past simply by carrying a min-width. A rule that matches one spelling of
     * the thing it bans is not a rule, so this matches the element.
     */
    const usingComponent = files.filter(([, s]) => s.includes("<DataTable")).length;
    expect(usingComponent).toBeGreaterThanOrEqual(14);

    const handRolled = files
      .filter(([, s]) => /<table[\s>]/.test(s))
      .map(([path]) => path)
      .filter((path) => !NOT_A_DATA_TABLE.has(path));
    expect(handRolled, "hand-rolled tables with no recorded reason").toEqual([]);

    // The row is half the point and was the half nobody adopted.
    expect(files.filter(([, s]) => s.includes("<TableRow")).length)
      .toBeGreaterThanOrEqual(10);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a file that no longer hand-rolls a table is stale, and a
    // stale exemption is how the rule above quietly stops applying.
    const stillHandRolled = new Set(
      files.filter(([, s]) => /<table[\s>]/.test(s)).map(([path]) => path)
    );
    const unused = [...NOT_A_DATA_TABLE.keys()].filter((path) => !stillHandRolled.has(path));
    expect(unused, "exemptions that no longer describe anything").toEqual([]);
  });
});

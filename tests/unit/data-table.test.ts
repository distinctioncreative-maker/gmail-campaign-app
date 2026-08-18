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
 * Tables whose shell genuinely differs, and why each one does.
 *
 * The component owns a wrapper, a `<table>`, and a bordered `<thead>`. A table
 * with no header row at all, or a sticky one, is not the same object wearing
 * different clothes, and routing it through a component that requires `head`
 * would mean inventing a header it does not have or bolting an escape hatch
 * onto the component for a single call site.
 */
const DIFFERENT_SHAPE = new Map([
  [
    "app/(dashboard)/system-health/page.tsx",
    "Two label-and-value lists with no header row. They are tables for alignment, not for columns.",
  ],
  [
    "components/campaign/RecipientTable.tsx",
    "One grouped view with no header, and one with a sticky header carrying its own shadow.",
  ],
  [
    "app/(dashboard)/campaigns/[campaignId]/page.tsx",
    "Borderless thead, deliberately quieter than a top-level data table.",
  ],
  [
    "app/(dashboard)/replies/page.tsx",
    "Standard shell, but the desktop table sits inside a responsive wrapper alongside a mobile card list. Convertible; left for a pass that can verify the responsive pair together.",
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
    expect(source).toContain("head: ReactNode");
    expect(source).not.toMatch(/columns\s*[:?]/);
    // The wrapper is the reason this exists: wide tables must scroll inside
    // themselves so the page body never scrolls sideways.
    expect(source).toContain("overflow-x-auto");
  });

  it("has actually displaced the hand-rolled shells", () => {
    const usingComponent = files.filter(([, s]) => s.includes("<DataTable")).length;
    const handRolled = files.filter(([, s]) =>
      s.includes('<table className="w-full text-left text-sm">')
    );
    expect(usingComponent).toBeGreaterThanOrEqual(9);

    const unexplained = handRolled
      .map(([path]) => path)
      .filter((path) => !DIFFERENT_SHAPE.has(path));
    expect(unexplained, "hand-rolled tables with no recorded reason").toEqual([]);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a file that no longer hand-rolls a table is stale, and a
    // stale exemption is how the rule above quietly stops applying.
    const stillHandRolled = new Set(
      files
        .filter(([, s]) => s.includes('<table className="w-full text-left text-sm">'))
        .map(([path]) => path)
    );
    const unused = [...DIFFERENT_SHAPE.keys()].filter((path) => !stillHandRolled.has(path));
    expect(unused, "exemptions that no longer describe anything").toEqual([]);
  });
});

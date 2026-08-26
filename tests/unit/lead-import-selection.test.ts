import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultSelection, isSelectable, type ClassifiedLead } from "@/components/imports/leadBadges";

const source = readFileSync("components/imports/LeadPreviewTable.tsx", "utf8");

function lead(patch: Partial<ClassifiedLead> & { index: number }): ClassifiedLead {
  return {
    fullName: "Jane Doe",
    firstName: "Jane",
    lastName: "Doe",
    businessName: "Acme Roofing",
    phone: null,
    region: null,
    requestedAmount: null,
    email: `jane${patch.index}@acme.com`,
    emailValid: true,
    emailOptOut: null,
    neverSwitchedFromNew: null,
    leadSource: null,
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
    sourceRecordId: null,
    rawText: "",
    warnings: [],
    confidence: 1,
    classification: "NEW",
    lastCampaignName: null,
    lastCampaignAt: null,
    ...patch,
  } as ClassifiedLead;
}

describe("which rows arrive ticked", () => {
  it("leaves risky addresses unticked but selectable", () => {
    /**
     * The behaviour the whole screen is built around. A role inbox is a
     * judgement call the customer should make deliberately, so it must not be
     * pre-selected, but it must remain possible to select.
     */
    const risky = lead({ index: 0, verification: { verdict: "RISKY" } as never });
    expect(defaultSelection([risky]).has(0)).toBe(false);
    expect(isSelectable(risky)).toBe(true);
  });

  it("never lets an undeliverable row be selected at all", () => {
    const dead = lead({ index: 1, verification: { verdict: "UNDELIVERABLE" } as never });
    expect(defaultSelection([dead]).has(1)).toBe(false);
    expect(isSelectable(dead)).toBe(false);
  });

  it("leaves previously contacted rows unticked too", () => {
    // Worth pinning because it means the manual-ticking population was always
    // larger than just "risky", which is why the fix had to be a bulk action
    // rather than a nudge about one verdict.
    for (const classification of ["CONTACTED_BEFORE", "REPLIED_BEFORE"]) {
      const l = lead({ index: 2, classification });
      expect(defaultSelection([l]).has(2), classification).toBe(false);
      expect(isSelectable(l), classification).toBe(true);
    }
  });
});

describe("acting on the rows that arrive unticked", () => {
  it("makes the verdict counts filters rather than static text", () => {
    /**
     * The strip already knew which rows were risky and printed the number,
     * while the only way to act on that set was to scroll the table hunting for
     * amber pills. The counts are buttons now.
     */
    const strip = source.slice(source.indexOf("Address check:"), source.indexOf("Search name"));
    expect(strip).toContain("onClick={() => setFilter(");
    expect(strip).toContain('aria-pressed={active}');
    // And the filter must be clearable, or narrowing is a one-way trip.
    expect(strip).toContain("Clear filter");
  });

  it("offers a bulk selection, which this table was the only one to lack", () => {
    expect(source).toContain("Select all shown");
    expect(source).toContain("function toggleShown()");
  });

  it("bulk-selects the filtered set, not merely the drawn rows", () => {
    /**
     * The correctness property behind the copy under the table. Rendering is
     * capped, so if the bulk action iterated the drawn rows it would silently
     * tick 200 of 900 risky addresses while claiming to have taken them all.
     * It iterates the filtered set instead.
     */
    const fn = source.slice(source.indexOf("function toggleShown()"), source.indexOf("function toggle("));
    expect(fn).toContain("selectableVisible");
    expect(fn).not.toContain("rendered");
  });

  it("caps what it paints and says so", () => {
    // A 5MB CSV parses to tens of thousands of rows and every one of them used
    // to render, inline, in the middle of the leads page.
    expect(source).toContain("const RENDER_STEP");
    expect(source).toContain("visible.slice(0, shown)");
    expect(source).toContain("rows drawn");
  });

  it("filters before it caps", () => {
    // The other order would show whichever rows survived the first N, so
    // narrowing to a verdict could return nothing while the count said twelve.
    expect(source.indexOf("const visible = useMemo")).toBeLessThan(
      source.indexOf("const rendered = visible.slice")
    );
  });

  it("keeps the table inside its own scroll container", () => {
    expect(source).toMatch(/DataTable className="[^"]*max-h-\[32rem\][^"]*overflow-y-auto/);
  });
});

describe("the status pills", () => {
  it("uses one badge shape, not two in adjacent cells", () => {
    // The Status column rendered a full pill while the Address column beside it
    // used the 6px `.badge`, so two differently-shaped chips sat in the same row.
    expect(source).not.toContain('rounded-full px-2 py-0.5 text-xs ${badge.className}');
    const body = source.slice(source.indexOf("<DataTable"));
    expect(body.match(/className=\{`badge /g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

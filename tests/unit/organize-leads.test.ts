import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeGroups } from "@/lib/ai/organizeLeads";

describe("sanitizing the groups a model proposes", () => {
  it("keeps a well-formed proposal", () => {
    const groups = sanitizeGroups(
      [
        { name: "roofing", reason: "Roofing contractors.", indices: [0, 1, 2] },
        { name: "dental", reason: "Dental practices.", indices: [3, 4] },
      ],
      10
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].indices).toEqual([0, 1, 2]);
  });

  it("drops indices that point at leads which do not exist", () => {
    /**
     * Dropped rather than clamped, and the distinction matters: clamping index
     * 99 to 9 does not fail, it tags a real person the model never chose.
     */
    const groups = sanitizeGroups(
      [{ name: "roofing", reason: "", indices: [0, 1, 99, -3, 2.7] }],
      5
    );
    expect(groups[0].indices).toEqual([0, 1, 2]);
  });

  it("never puts one lead in two groups", () => {
    // A lead in two groups gets two tags, and the reviewer sees per-group counts
    // that do not add up to the number of leads touched.
    const groups = sanitizeGroups(
      [
        { name: "roofing", reason: "", indices: [0, 1, 2] },
        { name: "builders", reason: "", indices: [1, 2, 3, 4] },
      ],
      10
    );
    const all = groups.flatMap((g) => g.indices);
    expect(new Set(all).size).toBe(all.length);
    expect(groups[1].indices).toEqual([3, 4]);
  });

  it("discards a group too small to be a segment", () => {
    // A group of one is not a segment, and its lead must be released so a later
    // group can still claim it.
    const groups = sanitizeGroups(
      [
        { name: "singleton", reason: "", indices: [0] },
        { name: "roofing", reason: "", indices: [0, 1, 2] },
      ],
      5
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("roofing");
    // The lead released by the discarded group is still usable.
    expect(groups[0].indices).toContain(0);
  });

  it("drops a duplicate group name rather than merging it", () => {
    // Two identical chips apply the same tag, and merging would silently attach
    // one group's reason to another group's leads.
    const groups = sanitizeGroups(
      [
        { name: "roofing", reason: "First.", indices: [0, 1] },
        { name: "roofing", reason: "Second.", indices: [2, 3] },
      ],
      10
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("First.");
  });

  it("survives a response that is not shaped like a proposal at all", () => {
    for (const junk of [null, undefined, "groups", 42, {}, [null], [{ name: "" }]]) {
      expect(() => sanitizeGroups(junk, 10)).not.toThrow();
      expect(sanitizeGroups(junk, 10)).toEqual([]);
    }
  });

  it("normalizes names into something the tag system accepts", () => {
    const groups = sanitizeGroups(
      [{ name: "  Auto Repair!!  ", reason: "", indices: [0, 1] }],
      5
    );
    expect(groups[0].name).not.toMatch(/^\s|\s$/);
    expect(groups[0].name.length).toBeLessThanOrEqual(32);
  });
});

describe("how organizing is exposed", () => {
  const route = readFileSync("app/api/leads/organize/route.ts", "utf8");
  const ui = readFileSync("components/leads/OrganizeLeads.tsx", "utf8");

  it("separates proposing from applying", () => {
    /**
     * Tagging hundreds of contacts is tedious to undo by hand, so it must not be
     * the invisible half of pressing a button labelled "organize". The GET
     * proposes and writes nothing; only the POST writes.
     */
    const get = route.slice(route.indexOf("export const GET"), route.indexOf("const ApplySchema"));
    expect(get).not.toContain("updateContactDetails");
    expect(route.slice(route.indexOf("export const POST"))).toContain("updateContactDetails");
  });

  it("re-reads every contact server-side instead of trusting the ids sent back", () => {
    // The client is handing back ids the server gave it, which is not a reason
    // to trust that it handed back only those.
    const post = route.slice(route.indexOf("export const POST"));
    expect(post).toContain("await getContact(ctx, contactId)");
  });

  it("adds a tag rather than replacing what a lead already has", () => {
    // Additive keeps the mistake cheap: disliking the result costs a tag
    // removal, not an unpicked reorganization.
    expect(route).toContain("addContactTag(contact.tags, tag)");
  });

  it("shows named examples, not just a count and a label", () => {
    // A reviewer cannot tell a good group from a wrong one without seeing which
    // businesses landed in it.
    expect(route).toContain("sample:");
    expect(ui).toContain("group.sample");
  });
});

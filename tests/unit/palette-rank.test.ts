import { describe, expect, it } from "vitest";
import {
  flattenGroups,
  groupResults,
  GROUP_ORDER,
  normalizeQuery,
  rankItems,
  scoreMatch,
  type PaletteResult,
} from "@/lib/search/rank";
import { actionResults, defaultResults, PALETTE_ACTIONS, PALETTE_PAGES } from "@/lib/search/actions";

describe("normalizeQuery", () => {
  it("collapses the ways people actually type", () => {
    expect(normalizeQuery("  Q3   Founders  ")).toBe("q3 founders");
    expect(normalizeQuery("ACME")).toBe("acme");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("scoreMatch ordering", () => {
  const item = (text: string, subtext?: string) => ({ text, subtext });

  it("puts an exact match above a prefix above a word above a substring", () => {
    // This ordering is the entire product. If typing three letters puts the
    // thing you wanted third, you stop using the palette.
    const exact = scoreMatch(item("q3"), "q3");
    const prefix = scoreMatch(item("q3 founders"), "q3");
    const word = scoreMatch(item("Series A founders"), "founders");
    const substring = scoreMatch(item("Series A founders"), "ounder");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("treats real name separators as word boundaries", () => {
    for (const text of ["acme-corp", "welcome_email", "sales/EU", "Q3 founders", "list.two"]) {
      const second = text.split(/[\s\-_/.]/)[1];
      expect(scoreMatch(item(text), second.toLowerCase()), text).toBeGreaterThanOrEqual(250);
    }
  });

  it("ranks a subtext hit below any primary hit", () => {
    // A campaign whose description mentions "acme" must not outrank the
    // campaign actually called Acme.
    const byName = scoreMatch(item("Acme outreach"), "acme");
    const byDescription = scoreMatch(item("Q3 founders", "targeting acme and friends"), "acme");
    expect(byName).toBeGreaterThan(byDescription);
    expect(byDescription).toBeGreaterThan(0);
  });

  it("finds terms that are all present but not adjacent", () => {
    // How people type when they half-remember a name.
    const score = scoreMatch(item("Q3 founders at Acme"), "acme q3");
    expect(score).toBeGreaterThan(0);
    // Weaker than a contiguous substring match, which is stronger evidence.
    expect(score).toBeLessThan(scoreMatch(item("Q3 founders at Acme"), "founders at"));
  });

  it("requires every term, not just one", () => {
    expect(scoreMatch(item("Q3 founders"), "q3 nonsense")).toBe(0);
  });

  it("scores nothing for a non-match or an empty query", () => {
    expect(scoreMatch(item("Q3 founders"), "zebra")).toBe(0);
    expect(scoreMatch(item("Q3 founders"), "")).toBe(0);
    expect(scoreMatch(item(""), "anything")).toBe(0);
  });

  it("is not confused by regex characters in the query", () => {
    // Someone pasting "sales (EU)" must not crash the palette.
    expect(() => scoreMatch(item("sales (EU)"), "(eu)")).not.toThrow();
    expect(scoreMatch(item("sales (EU)"), "(eu)")).toBeGreaterThan(0);
    expect(scoreMatch(item("a+b"), "a+b")).toBeGreaterThan(0);
  });
});

describe("rankItems", () => {
  const items = [
    { text: "Acme renewals", updatedAt: 1 },
    { text: "Acme", updatedAt: 2 },
    { text: "Prospecting at Acme", updatedAt: 3 },
  ];

  it("orders by relevance, not by recency", () => {
    // Recency-first would put the most recently touched campaign above an
    // exact name match, which is the most annoying way for this to fail.
    expect(rankItems(items, "acme", 5).map((i) => i.text)).toEqual([
      "Acme",
      "Acme renewals",
      "Prospecting at Acme",
    ]);
  });

  it("breaks ties by recency", () => {
    const tied = [
      { text: "Acme one", updatedAt: 100 },
      { text: "Acme two", updatedAt: 500 },
    ];
    expect(rankItems(tied, "acme", 5).map((i) => i.text)).toEqual(["Acme two", "Acme one"]);
  });

  it("is deterministic when score and recency both tie", () => {
    const tied = [{ text: "Beta" }, { text: "Alpha" }];
    expect(rankItems(tied, "a", 5).map((i) => i.text)).toEqual(["Alpha", "Beta"]);
  });

  it("respects the limit and returns nothing for an empty query", () => {
    expect(rankItems(items, "acme", 2)).toHaveLength(2);
    expect(rankItems(items, "   ", 5)).toEqual([]);
  });
});

describe("grouping and keyboard order", () => {
  const results: PaletteResult[] = [
    { id: "p1", group: "Pages", text: "Reports", href: "/reports" },
    { id: "c1", group: "Campaigns", text: "Q3", href: "/campaigns/1" },
    { id: "a1", group: "Actions", text: "New campaign", href: "/campaigns/new" },
    { id: "c2", group: "Campaigns", text: "Q4", href: "/campaigns/2" },
  ];

  it("orders groups so actions lead and pages trail", () => {
    expect(groupResults(results).map((s) => s.group)).toEqual(["Actions", "Campaigns", "Pages"]);
  });

  it("omits empty groups rather than drawing empty headings", () => {
    expect(groupResults(results).every((s) => s.items.length > 0)).toBe(true);
    expect(groupResults([])).toEqual([]);
  });

  it("flattens in exactly the drawn order", () => {
    // Arrow keys walk this array. If it disagrees with the render order the
    // highlight jumps across the list and the palette feels broken, so both
    // come from the same function.
    expect(flattenGroups(results).map((r) => r.id)).toEqual(["a1", "c1", "c2", "p1"]);
  });

  it("loses nothing in the round trip", () => {
    expect(flattenGroups(results)).toHaveLength(results.length);
  });

  it("declares an order for every group it can produce", () => {
    for (const result of results) expect(GROUP_ORDER).toContain(result.group);
  });
});

describe("the action catalog", () => {
  it("gives every entry search words beyond its own label", () => {
    // People search for the word in their head, not the label we chose:
    // "csv" and "upload" have to find Import leads.
    for (const action of [...PALETTE_ACTIONS, ...PALETTE_PAGES]) {
      expect(action.keywords.length, action.id).toBeGreaterThan(8);
      expect(action.href.startsWith("/"), action.id).toBe(true);
    }
  });

  it("finds actions by the words people actually type", () => {
    const all = actionResults({ isAdmin: true, hasTeams: true });
    for (const [query, expected] of [
      ["csv", "Import leads"],
      ["upload", "Import leads"],
      ["dkim", "Deliverability"],
      ["unsubscribe", "Do Not Email"],
      ["broken", "Contact support"],
      ["gdpr", "Export my data"],
    ] as const) {
      const top = rankItems(all, query, 3);
      expect(
        top.some((r) => r.text === expected),
        `${query} should find ${expected}`
      ).toBe(true);
    }
  });

  it("never offers a page the person cannot open", () => {
    const limited = actionResults({ isAdmin: false, hasTeams: false });
    const labels = limited.map((r) => r.text);
    expect(labels).not.toContain("Administration");
    expect(labels).not.toContain("System Health");
    expect(labels).not.toContain("Team");
    // And still offers everything ungated.
    expect(labels).toContain("New campaign");
  });

  it("offers admin surfaces to an admin", () => {
    const full = actionResults({ isAdmin: true, hasTeams: true }).map((r) => r.text);
    expect(full).toContain("Administration");
    expect(full).toContain("Team");
  });

  it("shows only actions before anything is typed", () => {
    const initial = defaultResults({ isAdmin: true, hasTeams: true });
    expect(initial.length).toBeGreaterThan(2);
    expect(initial.every((r) => r.group === "Actions")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_VIEWS_PER_SURFACE,
  activeViewId,
  applyView,
  isEmptyState,
  nameKey,
  normalizeFilters,
  normalizeName,
  sameState,
  type ViewState,
} from "@/lib/views/savedViews";
import { nextRowIndex, shouldIgnoreShortcut } from "@/lib/ui/keyboard";

const base: ViewState = {
  filters: { search: "", status: "replied", tag: "hot", list: "" },
  sortKey: "name",
  sortDir: "asc",
};

describe("normalizing a view's filters", () => {
  it("drops the controls that are at their default", () => {
    // Otherwise two views that differ in nothing compare as different, because
    // one recorded an empty tag and the other omitted it.
    expect(normalizeFilters(base.filters)).toEqual({ status: "replied", tag: "hot" });
  });

  it("treats the conventional all as a default", () => {
    expect(normalizeFilters({ status: "all" })).toEqual({});
  });

  it("trims, so a pasted filter value does not create a distinct view", () => {
    expect(normalizeFilters({ tag: "  hot  " })).toEqual({ tag: "hot" });
  });

  it("survives a missing filters object", () => {
    expect(normalizeFilters(undefined as unknown as Record<string, string>)).toEqual({});
  });
});

describe("view names", () => {
  it("collapses whitespace, because two spaces is not a second view", () => {
    expect(normalizeName("  Hot   leads ")).toBe("Hot leads");
  });

  it("compares case-insensitively", () => {
    expect(nameKey("Hot Leads")).toBe(nameKey("hot leads"));
  });

  it("bounds the length so a tab strip stays readable", () => {
    expect(normalizeName("x".repeat(200)).length).toBe(40);
  });
});

describe("which view is active", () => {
  it("matches on the state, not on a stored selection", () => {
    // Tracking a selected view separately means the highlight survives someone
    // changing a filter, and then the tab claims to describe a table it no
    // longer describes.
    const views = [{ viewId: "v1", ...base }];
    expect(activeViewId(views, base)).toBe("v1");
    expect(
      activeViewId(views, { ...base, filters: { ...base.filters, tag: "cold" } })
    ).toBeNull();
  });

  it("ignores differences that are only defaults", () => {
    // The stored view omits the empty search and list controls that the live
    // table carries; only the two filters that are actually set matter.
    const views = [
      {
        viewId: "v1",
        filters: { status: "replied", tag: "hot" },
        sortKey: "name",
        sortDir: "asc" as const,
      },
    ];
    expect(activeViewId(views, base)).toBe("v1");
  });

  it("treats a different sort as a different view", () => {
    // Sort is half of what most views are actually about.
    expect(sameState(base, { ...base, sortDir: "desc" })).toBe(false);
    expect(sameState(base, { ...base, sortKey: "added" })).toBe(false);
  });
});

describe("applying a stored view", () => {
  const known = ["search", "status", "tag", "list"];

  it("restores the filters it knows", () => {
    const applied = applyView(base, known, { status: "all" });
    expect(applied.filters.status).toBe("replied");
    expect(applied.filters.tag).toBe("hot");
  });

  it("falls back to the table's default for a filter that was added later", () => {
    const stored: ViewState = { filters: { status: "replied" }, sortKey: "name", sortDir: "asc" };
    const applied = applyView(stored, [...known, "owner"], { status: "all", owner: "anyone" });
    expect(applied.filters.owner).toBe("anyone");
  });

  it("ignores a filter the table no longer has", () => {
    // Refusing to apply the view instead would break someone's saved view on a
    // deploy they had nothing to do with.
    const stored: ViewState = {
      filters: { status: "replied", removedFilter: "x" },
      sortKey: "name",
      sortDir: "asc",
    };
    const applied = applyView(stored, known, {});
    expect(applied.filters.removedFilter).toBeUndefined();
    expect(applied.filters.status).toBe("replied");
  });
});

describe("what is worth saving", () => {
  it("does not offer to save the default table", () => {
    // An interface that lets you save it produces a tab called "Everything"
    // that does nothing.
    expect(isEmptyState({ filters: { status: "all", tag: "" }, sortKey: "", sortDir: "asc" })).toBe(
      true
    );
  });

  it("counts a sort on its own as worth saving", () => {
    expect(isEmptyState({ filters: {}, sortKey: "added", sortDir: "desc" })).toBe(false);
  });

  it("keeps the per-surface ceiling small enough that tabs stay useful", () => {
    expect(MAX_VIEWS_PER_SURFACE).toBeGreaterThanOrEqual(5);
    expect(MAX_VIEWS_PER_SURFACE).toBeLessThanOrEqual(20);
  });
});

describe("keyboard shortcuts", () => {
  const plain = { tagName: "BODY", isEditable: false, metaKey: false, ctrlKey: false, altKey: false };

  it("fires on the page body", () => {
    expect(shouldIgnoreShortcut(plain)).toBe(false);
  });

  it("stays out of the way while someone is typing", () => {
    // A single-letter shortcut that fires inside a search box is worse than no
    // shortcut: the page jumps mid-word and it reads as a bug.
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(shouldIgnoreShortcut({ ...plain, tagName }), tagName).toBe(true);
    }
    expect(shouldIgnoreShortcut({ ...plain, isEditable: true })).toBe(true);
  });

  it("never takes a modified keystroke", () => {
    // Cmd-K belongs to the command palette and Ctrl-J is a browser shortcut.
    expect(shouldIgnoreShortcut({ ...plain, metaKey: true })).toBe(true);
    expect(shouldIgnoreShortcut({ ...plain, ctrlKey: true })).toBe(true);
    expect(shouldIgnoreShortcut({ ...plain, altKey: true })).toBe(true);
  });

  it("clamps at the ends instead of wrapping", () => {
    // Pressing j again at the bottom usually means the key did not register, and
    // jumping to the top makes someone lose their place.
    expect(nextRowIndex(4, 1, 5)).toBe(4);
    expect(nextRowIndex(0, -1, 5)).toBe(0);
    expect(nextRowIndex(2, 1, 5)).toBe(3);
  });

  it("starts at the right end from nothing selected", () => {
    expect(nextRowIndex(-1, 1, 5)).toBe(0);
    expect(nextRowIndex(-1, -1, 5)).toBe(4);
  });

  it("does nothing in an empty list", () => {
    expect(nextRowIndex(-1, 1, 0)).toBe(-1);
  });
});

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

/** Every `<EmptyState … />` element in the product, with the file it sits in. */
function emptyStates(): Array<{ path: string; block: string }> {
  const found: Array<{ path: string; block: string }> = [];
  for (const path of [...walk("app"), ...walk("components")]) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/<EmptyState\b/g)) {
      // Scan to the self-closing `/>` at brace depth zero, so a prop holding a
      // ternary or a template literal does not end the element early.
      let depth = 0;
      for (let i = match.index; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") depth--;
        else if (depth === 0 && source.startsWith("/>", i)) {
          found.push({ path, block: source.slice(match.index, i + 2) });
          break;
        }
      }
    }
  }
  return found;
}

/**
 * Surfaces where an empty state genuinely has nothing to offer, and why.
 *
 * This list is the point of the test. Adding an action to every empty state
 * would be worse than adding none: a button that cannot change the emptiness is
 * a dead end wearing a hat, and it teaches a reader that the buttons on this
 * product are decorative. Each entry here is a case where the person looking at
 * the screen cannot act, so the honest thing is to say so and stop.
 */
const NOTHING_TO_OFFER = new Map([
  [
    "app/(dashboard)/admin/waitlist/page.tsx",
    "Enquiries arrive from visitors on the public site. An operator cannot create one.",
  ],
  [
    "app/(dashboard)/team/[userId]/page.tsx",
    "This is another rep's page. You cannot launch a campaign on their behalf.",
  ],
  [
    "components/admin/AuditLogList.tsx",
    "A filter returned nothing. The fix is changing the filter, which is already on screen.",
  ],
  [
    "app/(dashboard)/leads/lists/[listId]/page.tsx",
    "The paste-and-upload form sits directly above this panel on the same page.",
  ],
]);

describe("empty states", () => {
  const states = emptyStates();

  it("finds them all, so the rule below is not checking an empty set", () => {
    expect(states.length).toBeGreaterThanOrEqual(10);
  });

  it("offers a next step wherever the reader can actually take one", () => {
    /**
     * Eight of eleven empty states had no action at all: they named the
     * situation and stopped. On a surface a new customer reaches before they
     * have done anything, that is the screen most likely to decide whether they
     * continue, and "no sends yet" with no way to send is a cul-de-sac.
     *
     * The rule is not "every empty state gets a button". It is that an empty
     * state must either offer the action that fills it, or be listed above as a
     * case where no such action exists.
     */
    const deadEnds = states
      .filter((state) => !state.block.includes("action="))
      .map((state) => state.path)
      .filter((path) => !NOTHING_TO_OFFER.has(path));

    expect([...new Set(deadEnds)]).toEqual([]);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a file that no longer has an actionless empty state is
    // stale, and a stale exemption is how the rule above quietly stops applying.
    const actionless = new Set(
      states.filter((state) => !state.block.includes("action=")).map((state) => state.path)
    );
    const unused = [...NOTHING_TO_OFFER.keys()].filter((path) => !actionless.has(path));
    expect(unused, "exemptions that no longer describe anything").toEqual([]);
  });

  it("says what the surface is for rather than that it is empty", () => {
    /**
     * "No data" tells a reader something they can already see. The titles here
     * are benefit-led, and this keeps them that way: a title that opens with
     * "No " has to earn it by being one of the states where nothing can be done.
     */
    const bare = states
      .filter((state) => /title="No\s/.test(state.block))
      .map((state) => state.path)
      .filter((path) => !NOTHING_TO_OFFER.has(path));

    // "No sends yet" on Reports survives deliberately: it is a factual status on
    // a reporting surface rather than an onboarding moment, and it now carries
    // the action that fixes it.
    expect([...new Set(bare)]).toEqual(["components/analytics/ReportSections.tsx"]);
  });
});

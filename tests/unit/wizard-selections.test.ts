import { describe, expect, it } from "vitest";
import { buildLaunchSelections, computeListScopedCounts } from "@/lib/campaigns/wizardSelections";

describe("buildLaunchSelections", () => {
  it("only submits contacts the user selected", () => {
    const contacts = [{ contactId: "a" }, { contactId: "b" }, { contactId: "c" }];
    const selected = new Set(["a", "c"]);
    const result = buildLaunchSelections(contacts, selected);
    expect(result).toEqual([
      { contactId: "a", included: true, overrideReason: null },
      { contactId: "c", included: true, overrideReason: null },
    ]);
  });

  it("never emits included:false for a merely-unselected contact — this was the recipient-count bug", () => {
    // Regression guard for the exact symptom reported: launching a campaign
    // against a 43-person list out of a 215-contact account used to submit
    // all 215, with included:false for the 172 never chosen, creating a
    // real "excluded" Recipient row for each of them.
    const contacts = Array.from({ length: 215 }, (_, i) => ({ contactId: `c${i}` }));
    const selected = new Set(contacts.slice(0, 43).map((c) => c.contactId));
    const result = buildLaunchSelections(contacts, selected);
    expect(result).toHaveLength(43);
    expect(result.every((s) => s.included === true)).toBe(true);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(buildLaunchSelections([{ contactId: "a" }], new Set())).toEqual([]);
  });
});

describe("computeListScopedCounts", () => {
  const contacts = [
    { classification: "NEW", listIds: ["listA"] },
    { classification: "NEW", listIds: ["listA"] },
    { classification: "EXISTING_NOT_CONTACTED", listIds: ["listB"] },
    { classification: "CONTACTED_BEFORE", listIds: ["listA"] },
    { classification: "UNSUBSCRIBED", listIds: ["listA"] },
    { classification: "BOUNCED", listIds: ["listB"] },
    { classification: "SUPPRESSED", listIds: [] },
  ];

  it("counts across every contact when no list is chosen", () => {
    const counts = computeListScopedCounts(contacts, "");
    expect(counts.total).toBe(7);
    expect(counts.ready).toBe(3); // 2 NEW + 1 EXISTING_NOT_CONTACTED
    expect(counts.usedBefore).toBe(1);
    expect(counts.excluded).toBe(3);
  });

  it("scopes every count to the chosen list — this was the other half of the recipient-count bug", () => {
    // Before the fix, "excluded" (and ready/usedBefore) counted the user's
    // entire contact universe regardless of which list they picked, so
    // picking a 2-person list could still show exclusions from contacts
    // completely unrelated to this campaign.
    const counts = computeListScopedCounts(contacts, "listA");
    expect(counts.total).toBe(4);
    expect(counts.ready).toBe(2);
    expect(counts.usedBefore).toBe(1);
    expect(counts.excluded).toBe(1);
    expect(counts.excludedByReason).toEqual([{ label: "Unsubscribed", count: 1 }]);
  });

  it("breaks the excluded count down by reason, omitting zero-count reasons", () => {
    const counts = computeListScopedCounts(contacts, "listB");
    expect(counts.excluded).toBe(1);
    expect(counts.excludedByReason).toEqual([{ label: "Bounced before", count: 1 }]);
  });

  it("returns an empty reason breakdown when nothing is excluded", () => {
    const onlyReady = [{ classification: "NEW", listIds: [] }];
    expect(computeListScopedCounts(onlyReady, "").excludedByReason).toEqual([]);
  });
});

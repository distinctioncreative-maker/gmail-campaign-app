import { describe, expect, it } from "vitest";
import {
  EMPTY_CRITERIA,
  describeCriteria,
  isSearchable,
  type SourcedPerson,
} from "@/lib/sourcing/provider";
import { toParsedLead, toParsedLeads, usablePeople, withheldCount } from "@/lib/sourcing/normalize";
import {
  DEFAULT_MONTHLY_CREDITS,
  MAX_CREDITS_PER_SEARCH,
  applyUsage,
  authorizeSearch,
  creditsAvailable,
  describeCredits,
  monthKey,
} from "@/lib/sourcing/quota";
import { ParsedLeadSchema } from "@/schemas/parsedLead";

function person(overrides: Partial<SourcedPerson> = {}): SourcedPerson {
  return {
    providerId: "p1",
    firstName: "Dana",
    lastName: "Reed",
    title: "Owner",
    companyName: "Reed Haulage",
    email: "dana@reedhaulage.com",
    emailIsGuess: false,
    location: "Austin, Texas, US",
    industry: "logistics",
    employeeCount: 24,
    linkedinUrl: "https://linkedin.com/in/danareed",
    ...overrides,
  };
}

describe("refusing an unfiltered search", () => {
  it("rejects empty criteria", () => {
    // An unfiltered search returns the vendor's whole database a page at a time
    // and bills for every page, so this is a spending control rather than a
    // usability nicety.
    expect(isSearchable(EMPTY_CRITERIA)).toBe(false);
  });

  it("accepts any one real narrowing filter", () => {
    expect(isSearchable({ ...EMPTY_CRITERIA, titles: ["Owner"] })).toBe(true);
    expect(isSearchable({ ...EMPTY_CRITERIA, industries: ["logistics"] })).toBe(true);
    expect(isSearchable({ ...EMPTY_CRITERIA, keywords: "haulage" })).toBe(true);
  });

  it("does not count a one-character keyword as a filter", () => {
    expect(isSearchable({ ...EMPTY_CRITERIA, keywords: "a" })).toBe(false);
    expect(isSearchable({ ...EMPTY_CRITERIA, keywords: "   " })).toBe(false);
  });

  it("does not treat a location alone as narrow enough", () => {
    // "Everyone in Texas" is not a search, and it is a very expensive one.
    expect(isSearchable({ ...EMPTY_CRITERIA, locations: ["Texas"] })).toBe(false);
    expect(
      isSearchable({ ...EMPTY_CRITERIA, locations: ["Texas"], maxEmployees: 200 })
    ).toBe(true);
  });

  it("describes the criteria in words a person can check", () => {
    const text = describeCriteria({
      ...EMPTY_CRITERIA,
      titles: ["Owner"],
      locations: ["Texas"],
      minEmployees: 5,
      maxEmployees: 200,
    });
    expect(text).toContain("Owner");
    expect(text).toContain("Texas");
    expect(text).toContain("5");
  });
});

describe("normalizing a vendor row", () => {
  it("produces something the existing import path accepts", () => {
    // The reuse that matters: a sourced lead goes through the same verification,
    // the same suppression checks, and the same import route as a pasted CSV.
    const lead = toParsedLead(person(), 0);
    expect(() => ParsedLeadSchema.parse(lead)).not.toThrow();
    expect(lead.email).toBe("dana@reedhaulage.com");
    expect(lead.fullName).toBe("Dana Reed");
    expect(lead.leadSource).toBe("SOURCING");
  });

  it("keeps the vendor id, so a re-run is not a duplicate", () => {
    expect(toParsedLead(person({ providerId: "abc" }), 0).sourceRecordId).toBe("abc");
  });

  it("drops a person whose address the vendor withheld", () => {
    // Importing these creates contacts that can never be emailed, sitting in the
    // list looking like leads and making every rate in reporting wrong.
    const rows = [person(), person({ providerId: "p2", email: null })];
    expect(usablePeople(rows)).toHaveLength(1);
    expect(withheldCount(rows)).toBe(1);
  });

  it("drops a row whose address is not an address", () => {
    expect(usablePeople([person({ email: "email_not_unlocked" })])).toHaveLength(0);
  });

  it("keeps one row per address across pages", () => {
    const rows = [person(), person({ providerId: "p2" })];
    expect(usablePeople(rows)).toHaveLength(1);
  });

  it("warns rather than hides when the vendor guessed the address", () => {
    // A guessed address is the biggest bounce risk in sourced data, and the
    // preview is the last point where someone can decline it.
    const lead = toParsedLead(person({ emailIsGuess: true }), 0);
    expect(lead.warnings.join(" ")).toMatch(/guess/i);
  });

  it("leaves opt-out unknown rather than asserting consent", () => {
    // A vendor knows nothing about anyone's opt-out preferences, and false here
    // would be claiming knowledge we do not have.
    expect(toParsedLead(person(), 0).emailOptOut).toBeNull();
  });

  it("does not put the raw vendor payload in a field that is displayed", () => {
    const lead = toParsedLead(person(), 0);
    expect(lead.rawText).not.toContain("linkedin.com");
    expect(lead.rawText).toContain("Owner");
  });

  it("renumbers after dropping, so indexes stay contiguous for the preview", () => {
    const leads = toParsedLeads([
      person({ providerId: "a", email: null }),
      person({ providerId: "b", email: "b@x.com" }),
      person({ providerId: "c", email: "c@x.com" }),
    ]);
    expect(leads.map((l) => l.index)).toEqual([0, 1]);
  });

  it("survives a row with almost nothing in it", () => {
    const lead = toParsedLead(
      person({ firstName: "", lastName: "", companyName: "", email: "x@y.com" }),
      0
    );
    expect(() => ParsedLeadSchema.parse(lead)).not.toThrow();
    expect(lead.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("credit accounting", () => {
  const state = { month: monthKey(), used: 0, limit: 100 };

  it("grants what was asked when there is room", () => {
    const verdict = authorizeSearch(state, 25);
    expect(verdict.allowed).toBe(true);
    expect(verdict.grant).toBe(25);
  });

  it("grants what is left rather than refusing", () => {
    // Someone with 12 credits left should get 12 leads, not an error telling
    // them they cannot have 25.
    const verdict = authorizeSearch({ ...state, used: 88 }, 25);
    expect(verdict.allowed).toBe(true);
    expect(verdict.grant).toBe(12);
    expect(verdict.reason).toContain("12");
  });

  it("refuses once the month is spent", () => {
    const verdict = authorizeSearch({ ...state, used: 100 }, 25);
    expect(verdict.allowed).toBe(false);
    expect(verdict.grant).toBe(0);
  });

  it("caps a single search however much is asked for", () => {
    // A vendor page of 500 is one request and 500 charges.
    const verdict = authorizeSearch({ ...state, limit: 10_000 }, 5_000);
    expect(verdict.grant).toBe(MAX_CREDITS_PER_SEARCH);
  });

  it("treats a counter from last month as spent nothing", () => {
    // The reset costs no write and cannot half-apply.
    expect(creditsAvailable({ month: "2001-01", used: 100, limit: 100 })).toBe(100);
  });

  it("does not add this month's usage to a previous month's total", () => {
    const next = applyUsage({ month: "2001-01", used: 90, limit: 100 }, 10);
    expect(next.month).toBe(monthKey());
    expect(next.used).toBe(10);
  });

  it("accumulates within the same month", () => {
    const next = applyUsage({ month: monthKey(), used: 10, limit: 100 }, 5);
    expect(next.used).toBe(15);
  });

  it("handles a refund expressed as a negative charge", () => {
    // Reservations are settled by delta, and a search that returned fewer rows
    // than it reserved must not cost the difference.
    const next = applyUsage({ month: monthKey(), used: 25, limit: 100 }, -13);
    expect(next.used).toBe(25);
  });

  it("never reports a negative balance", () => {
    expect(creditsAvailable({ month: monthKey(), used: 500, limit: 100 })).toBe(0);
  });

  it("treats a malformed counter as zero rather than NaN", () => {
    const broken = {
      month: monthKey(),
      used: undefined as unknown as number,
      limit: undefined as unknown as number,
    };
    expect(creditsAvailable(broken)).toBe(0);
    expect(authorizeSearch(broken, 10).allowed).toBe(false);
  });

  it("starts a workspace with a deliberately small allowance", () => {
    // Enough to prove the feature is useful, not enough to be worth abusing
    // before anyone has paid for it.
    expect(DEFAULT_MONTHLY_CREDITS).toBeGreaterThan(0);
    expect(DEFAULT_MONTHLY_CREDITS).toBeLessThanOrEqual(1000);
  });

  it("says what is left in words, including when nothing is", () => {
    expect(describeCredits({ month: monthKey(), used: 0, limit: 100 })).toContain("100");
    expect(describeCredits({ month: monthKey(), used: 100, limit: 100 })).toMatch(/no sourcing/i);
  });
});

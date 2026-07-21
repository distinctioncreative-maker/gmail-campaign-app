import { describe, expect, it } from "vitest";
import {
  ContactPatchSchema,
  engagementFromRecipients,
  splitFullName,
  type RecipientEngagementRow,
} from "@/lib/leads/engagement";

function row(partial: Partial<RecipientEngagementRow>): RecipientEngagementRow {
  return {
    contactId: "c1",
    initialSentAt: null,
    lastSentAt: null,
    currentStep: 0,
    repliedAt: null,
    bouncedAt: null,
    unsubscribedAt: null,
    bounceType: null,
    ...partial,
  };
}

describe("splitFullName", () => {
  it("splits first and last", () => {
    expect(splitFullName("Maria Santos")).toEqual({ firstName: "Maria", lastName: "Santos" });
  });
  it("keeps multi-part last names together", () => {
    expect(splitFullName("Ana de la Cruz")).toEqual({ firstName: "Ana", lastName: "de la Cruz" });
  });
  it("handles single names and empty input", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitFullName("  ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("engagementFromRecipients", () => {
  it("counts initial + follow-up emails per sent recipient", () => {
    const e = engagementFromRecipients([
      row({ initialSentAt: 100, currentStep: 2 }), // initial + 2 follow-ups
      row({ initialSentAt: 200, currentStep: 0 }), // another campaign, initial only
    ]).get("c1")!;
    expect(e.emailsSentCount).toBe(4);
    expect(e.lastOutcome).toBe("EMAILED");
  });

  it("does not count unsent recipients", () => {
    const e = engagementFromRecipients([row({ initialSentAt: null, currentStep: 3 })]).get("c1")!;
    expect(e.emailsSentCount).toBe(0);
    expect(e.lastOutcome).toBeNull();
  });

  it("tracks first and most recent reply and counts replies across campaigns", () => {
    const e = engagementFromRecipients([
      row({ initialSentAt: 10, repliedAt: 500 }),
      row({ initialSentAt: 20, repliedAt: 900 }),
    ]).get("c1")!;
    expect(e.replyCount).toBe(2);
    expect(e.repliedAt).toBe(500);
    expect(e.lastRepliedAt).toBe(900);
    expect(e.lastOutcome).toBe("REPLIED");
  });

  it("prefers the most recent terminal event as outcome", () => {
    const e = engagementFromRecipients([
      row({ initialSentAt: 10, repliedAt: 500 }),
      row({ initialSentAt: 20, unsubscribedAt: 800 }),
    ]).get("c1")!;
    expect(e.lastOutcome).toBe("UNSUBSCRIBED");
  });

  it("flags hard bounces for suppression mirroring", () => {
    const e = engagementFromRecipients([
      row({ initialSentAt: 10, bouncedAt: 300, bounceType: "HARD" }),
    ]).get("c1")!;
    expect(e.hardBounced).toBe(true);
    expect(e.lastOutcome).toBe("BOUNCED");
  });

  it("keeps contacts separate", () => {
    const m = engagementFromRecipients([
      row({ contactId: "a", initialSentAt: 1, repliedAt: 2 }),
      row({ contactId: "b", initialSentAt: 1 }),
    ]);
    expect(m.get("a")!.replyCount).toBe(1);
    expect(m.get("b")!.replyCount).toBe(0);
  });
});

describe("ContactPatchSchema", () => {
  it("accepts a partial edit", () => {
    const p = ContactPatchSchema.parse({ fullName: "New Name", requestedAmount: 5000 });
    expect(p.fullName).toBe("New Name");
    expect(p.businessName).toBeUndefined();
  });
  it("rejects negative amounts and unknown-typed notes", () => {
    expect(() => ContactPatchSchema.parse({ requestedAmount: -1 })).toThrow();
    expect(() => ContactPatchSchema.parse({ notes: 42 })).toThrow();
  });
});

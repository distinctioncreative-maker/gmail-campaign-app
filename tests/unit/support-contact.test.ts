import { describe, expect, it } from "vitest";
import {
  categoryHint,
  describeCategory,
  supportCategoryOptions,
  supportMailto,
  supportReference,
  SUPPORT_CATEGORIES,
} from "@/lib/support/contact";

describe("supportReference", () => {
  it("produces a stable, quotable shape", () => {
    expect(supportReference("00112233445566778899aabb")).toMatch(/^CDN-[0-9A-Z]{6}$/);
  });

  it("is deterministic for the same randomness", () => {
    expect(supportReference("deadbeefcafef00d")).toBe(supportReference("deadbeefcafef00d"));
  });

  it("avoids the characters people misread out loud", () => {
    // I/L/O/U are absent from the alphabet on purpose: a reference read down a
    // phone or retyped from a screenshot must not become a different valid
    // reference. Walk enough of the input space to actually exercise it.
    for (let i = 0; i < 512; i += 1) {
      const hex = i.toString(16).padStart(2, "0").repeat(8);
      expect(supportReference(hex).slice(4)).not.toMatch(/[ILOU]/);
    }
  });

  it("refuses randomness too short to be unguessable", () => {
    // Silently padding a short input would mint references that collide, and
    // two customers sharing a reference is worse than a thrown error here.
    expect(() => supportReference("abc")).toThrow();
    expect(() => supportReference("")).toThrow();
  });

  it("tolerates a dashed or uppercase hex string", () => {
    expect(supportReference("DEAD-BEEF-CAFE-F00D")).toBe(supportReference("deadbeefcafef00d"));
  });
});

describe("supportMailto", () => {
  it("prefills the subject", () => {
    const url = supportMailto("help@example.com", { subject: "Cannot sign in" });
    expect(url.startsWith("mailto:help%40example.com?")).toBe(true);
    expect(url).toContain("subject=Cannot+sign+in");
  });

  it("carries a reference into the body when there is one", () => {
    const url = supportMailto("help@example.com", { reference: "CDN-ABC123" });
    expect(url).toContain("body=Reference%3A+CDN-ABC123");
  });

  it("cannot be used to inject extra mail headers", () => {
    // A newline in a mailto subject can become a second header in some
    // clients. Everything is encoded, so a raw CR or LF never survives.
    const url = supportMailto("help@example.com", {
      subject: "Hi\r\nBcc: everyone@example.com",
    });
    expect(url).not.toContain("\n");
    expect(url).not.toContain("\r");
    expect(url).not.toContain("Bcc:");
  });

  it("falls back to a usable subject when none is given", () => {
    expect(supportMailto("help@example.com")).toContain("subject=Cadence+support");
    expect(supportMailto("help@example.com", { subject: "   " })).toContain(
      "subject=Cadence+support"
    );
  });
});

describe("support categories", () => {
  it("gives every category a label and a hint that says what to include", () => {
    // A category with a vague hint is a category that produces a ticket we
    // have to reply to with a question.
    for (const category of SUPPORT_CATEGORIES) {
      expect(describeCategory(category).length).toBeGreaterThan(3);
      expect(categoryHint(category).length).toBeGreaterThan(20);
    }
  });

  it("offers every category to the form", () => {
    expect(supportCategoryOptions().map((o) => o.value)).toEqual([...SUPPORT_CATEGORIES]);
  });

  it("covers the ways someone actually gets stuck", () => {
    // Locked out and billing are the two that cannot be self-served, so their
    // absence would be the expensive kind of gap.
    expect(SUPPORT_CATEGORIES).toContain("ACCOUNT_ACCESS");
    expect(SUPPORT_CATEGORIES).toContain("BILLING");
  });
});

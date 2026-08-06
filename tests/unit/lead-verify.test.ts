import { describe, expect, it } from "vitest";
import {
  isDisposableDomain,
  isRoleAddress,
  splitEmail,
  suggestDomain,
  summarize,
  verifyEmailOffline,
} from "@/lib/leads/verify";

const ok = (email: string, hasMx: boolean | null = true) =>
  verifyEmailOffline(email, { hasMx, isValidSyntax: true });

describe("verifyEmailOffline", () => {
  it("passes an ordinary business address", () => {
    const result = ok("dana.reed@northwindpartners.com");
    expect(result.verdict).toBe("DELIVERABLE");
    expect(result.findings).toEqual([]);
  });

  it("rejects a domain with no mail server", () => {
    // The highest-yield check available without a paid service: nothing sent
    // to a domain with no MX can ever arrive.
    const result = ok("someone@company-that-shut-down.example", false);
    expect(result.verdict).toBe("UNDELIVERABLE");
    expect(result.findings[0]!.code).toBe("NO_MX");
  });

  it("never treats an unknown MX result as a failure", () => {
    // Null means the lookup did not complete. Treating a DNS timeout as a
    // dead domain would quietly delete a customer's good leads.
    expect(ok("dana@northwindpartners.com", null).verdict).toBe("DELIVERABLE");
  });

  it("rejects throwaway providers outright", () => {
    const result = ok("someone@mailinator.com");
    expect(result.verdict).toBe("UNDELIVERABLE");
    expect(result.findings[0]!.code).toBe("DISPOSABLE");
  });

  it("catches the typos people actually make, and offers the fix", () => {
    for (const [typo, expected] of [
      ["gmial.com", "gmail.com"],
      ["gmai.com", "gmail.com"],
      ["hotmial.com", "hotmail.com"],
      ["outlok.com", "outlook.com"],
    ] as const) {
      expect(suggestDomain(typo), typo).toBe(expected);
    }
    const result = ok("dana@gmial.com");
    expect(result.verdict).toBe("RISKY");
    const typo = result.findings.find((f) => f.code === "LIKELY_TYPO");
    expect(typo?.suggestion).toBe("dana@gmail.com");
  });

  it("does not invent typos for real domains", () => {
    // A threshold too loose turns every short domain into a suggestion for
    // every other short domain, and the feature becomes noise.
    for (const domain of [
      "gmail.com",
      "northwindpartners.com",
      "acme.io",
      "bbc.co.uk",
      "stripe.com",
    ]) {
      expect(suggestDomain(domain), domain).toBeNull();
    }
  });

  it("flags role inboxes without discarding them", () => {
    // Plenty of small businesses genuinely run on info@; silently dropping a
    // customer's leads would be worse than warning them.
    const result = ok("info@northwindpartners.com");
    expect(result.verdict).toBe("RISKY");
    expect(result.findings.some((f) => f.code === "ROLE_ADDRESS")).toBe(true);
  });

  it("sees through a plus tag on a role address", () => {
    expect(isRoleAddress("sales+q3@acme.com")).toBe(true);
    expect(isRoleAddress("dana+news@acme.com")).toBe(false);
  });

  it("rejects bad syntax and over-long addresses", () => {
    expect(verifyEmailOffline("nope", { isValidSyntax: false }).verdict).toBe("UNDELIVERABLE");
    const long = `${"a".repeat(250)}@acme.com`;
    expect(ok(long).findings[0]!.code).toBe("TOO_LONG");
  });

  it("reports every reason, not just the first", () => {
    const result = ok("info@gmial.com");
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("LIKELY_TYPO");
    expect(codes).toContain("ROLE_ADDRESS");
  });
});

describe("splitEmail", () => {
  it("splits on the last @, so quoted locals do not break it", () => {
    expect(splitEmail("a@b@acme.com")).toEqual({ local: "a@b", domain: "acme.com" });
    expect(splitEmail("noat")).toBeNull();
    expect(splitEmail("@acme.com")).toBeNull();
    expect(splitEmail("dana@")).toBeNull();
  });
});

describe("isDisposableDomain", () => {
  it("is case insensitive", () => {
    expect(isDisposableDomain("MailInator.com")).toBe(true);
    expect(isDisposableDomain("northwindpartners.com")).toBe(false);
  });
});

describe("summarize", () => {
  it("counts each verdict for the import header", () => {
    const counts = summarize([
      ok("a@acme.com"),
      ok("info@acme.com"),
      ok("b@mailinator.com"),
      ok("c@dead.example", false),
    ]);
    expect(counts).toEqual({ deliverable: 1, risky: 1, undeliverable: 2 });
  });
});

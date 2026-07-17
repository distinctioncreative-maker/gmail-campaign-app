import { describe, expect, it } from "vitest";
import { isAllowedAccount, parseAllowedDomains } from "@/lib/auth/domains";

describe("parseAllowedDomains", () => {
  it("parses a single domain", () => {
    expect(parseAllowedDomains("alpinefundings.com")).toEqual(["alpinefundings.com"]);
  });
  it("parses a comma-separated list with spaces and case", () => {
    expect(parseAllowedDomains("Alpinefundings.com, everestbusinessfunding.com ")).toEqual([
      "alpinefundings.com",
      "everestbusinessfunding.com",
    ]);
  });
  it("returns empty for blank input", () => {
    expect(parseAllowedDomains("")).toEqual([]);
  });
});

describe("isAllowedAccount", () => {
  const allowed = ["alpinefundings.com", "everestbusinessfunding.com"];

  it("accepts an email on either allowed domain", () => {
    expect(isAllowedAccount("rep@alpinefundings.com", "alpinefundings.com", allowed)).toBe(true);
    expect(isAllowedAccount("rep@everestbusinessfunding.com", null, allowed)).toBe(true);
  });

  it("rejects other domains even with a matching hd claim", () => {
    expect(isAllowedAccount("x@gmail.com", "alpinefundings.com", allowed)).toBe(false);
  });

  it("rejects a mismatched hd claim even when the email domain matches", () => {
    expect(isAllowedAccount("rep@alpinefundings.com", "evil.com", allowed)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedAccount("Rep@AlpineFundings.com", "ALPINEFUNDINGS.COM", allowed)).toBe(true);
  });

  it("allows everything when the list is empty (dev only)", () => {
    expect(isAllowedAccount("anyone@anywhere.com", null, [])).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  normalizeBusinessName,
  normalizeEmail,
  normalizePhone,
  splitFullName,
} from "@/lib/parser/normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });
  it("does not strip dots or plus tags", () => {
    expect(normalizeEmail("a.b+c@d.com")).toBe("a.b+c@d.com");
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("jared@mannon-mechanical.com")).toBe(true);
  });
  it("rejects double-@ and missing TLD", () => {
    expect(isValidEmail("x@@y.com")).toBe(false);
    expect(isValidEmail("x@y")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("strips formatting", () => {
    expect(normalizePhone("(469) 971-4333")).toBe("4699714333");
  });
  it("drops leading country code 1", () => {
    expect(normalizePhone("+1 469 971 4333")).toBe("4699714333");
  });
});

describe("normalizeBusinessName", () => {
  it("removes suffixes and punctuation", () => {
    expect(normalizeBusinessName("Mannon Mechanical Llc")).toBe("mannon mechanical");
    expect(normalizeBusinessName("Healing Space Therapeutics PLLc")).toBe(
      "healing space therapeutics"
    );
  });
});

describe("splitFullName", () => {
  it("splits first and last", () => {
    expect(splitFullName("Jason Main")).toEqual({ firstName: "Jason", lastName: "Main" });
  });
  it("keeps multi-part last names", () => {
    expect(splitFullName("Ana de la Cruz")).toEqual({ firstName: "Ana", lastName: "de la Cruz" });
  });
  it("handles single names", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});

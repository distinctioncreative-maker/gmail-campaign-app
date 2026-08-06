import { describe, expect, it } from "vitest";
import {
  analyzeSpintax,
  describeVariants,
  expandSpintax,
  hasSpintax,
  seededPicker,
} from "@/lib/personalization/spintax";
import { renderTemplate } from "@/lib/personalization/render";

describe("expandSpintax", () => {
  it("picks one option and drops the braces", () => {
    const out = expandSpintax("{Hi|Hello|Hey} there", "seed-1");
    expect(["Hi there", "Hello there", "Hey there"]).toContain(out);
    expect(out).not.toContain("{");
    expect(out).not.toContain("|");
  });

  it("is identical for the same seed, every time", () => {
    // Determinism is the requirement, not randomness. A retry after an
    // ambiguous delivery has to render byte-identical output, or one recipient
    // can receive two visibly different versions of the same email.
    const template = "{Hi|Hello|Hey} {there|friend}, {quick|short} question";
    const first = expandSpintax(template, "recipient-42:step-0");
    for (let i = 0; i < 20; i += 1) {
      expect(expandSpintax(template, "recipient-42:step-0")).toBe(first);
    }
  });

  it("gives different recipients different wording", () => {
    const template = "{a|b|c|d|e|f|g|h}{1|2|3|4|5|6|7|8}";
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(expandSpintax(template, `recipient-${i}`));
    // Not asking for perfect distribution, just that the seed actually moves
    // the outcome: one shared body across forty leads would be the bug.
    expect(seen.size).toBeGreaterThan(5);
  });

  it("handles nesting instead of mangling it", () => {
    const out = expandSpintax("{Hi {there|friend}|Hello}", "seed");
    expect(["Hi there", "Hi friend", "Hello"]).toContain(out);
  });

  it("leaves text with no spintax completely untouched", () => {
    const plain = "<p>Hello {{first_name}}, quick question.</p>";
    expect(expandSpintax(plain, "seed")).toBe(plain);
    expect(hasSpintax(plain)).toBe(false);
  });
});

describe("spintax and placeholders share a brace", () => {
  it("never eats a brace from a placeholder", () => {
    // The failure this prevents is product-wide: a parser that read
    // {{first_name}} as a group with one option would strip a brace from every
    // placeholder in every template already in the database.
    const out = expandSpintax("{Hi|Hello} {{first_name}}, about {{business_name}}", "seed");
    expect(out).toContain("{{first_name}}");
    expect(out).toContain("{{business_name}}");
  });

  it("keeps a placeholder that lives inside a spin option", () => {
    const out = expandSpintax("{Hi {{first_name}}|Hello there}", "seed");
    expect(["Hi {{first_name}}", "Hello there"]).toContain(out);
  });

  it("survives an unterminated placeholder without losing the text", () => {
    const out = expandSpintax("Hello {{first_name", "seed");
    expect(out).toBe("Hello {{first_name");
  });

  it("expands before substitution, so lead data can never become markup", () => {
    // A company literally named "Foo {Bar|Baz}" is data. Substituting first
    // would let a contact's own field decide what the email says.
    const template = "{Hi|Hello} {{business_name}}";
    const expanded = expandSpintax(template, "seed");
    const rendered = renderTemplate(expanded, { business_name: "Foo {Bar|Baz}" });
    expect(rendered.output).toContain("Foo {Bar|Baz}");
    expect(rendered.unresolved).toEqual([]);
  });
});

describe("analyzeSpintax", () => {
  it("counts the product of the options", () => {
    expect(analyzeSpintax("{a|b} {c|d|e}").variants).toBe(6);
    expect(analyzeSpintax("{a|b} {c|d} {e|f} {g|h}").variants).toBe(16);
  });

  it("counts nested groups through the branch that contains them", () => {
    // {Hi {there|friend}|Hello} is three bodies: Hi there, Hi friend, Hello.
    expect(analyzeSpintax("{Hi {there|friend}|Hello}").variants).toBe(3);
  });

  it("reports one for a template with no variation", () => {
    const analysis = analyzeSpintax("<p>Hello {{first_name}}</p>");
    expect(analysis.variants).toBe(1);
    expect(analysis.groups).toBe(0);
  });

  it("clamps a combinatorial explosion instead of reporting Infinity", () => {
    const analysis = analyzeSpintax("{a|b}".repeat(40));
    expect(analysis.clamped).toBe(true);
    expect(Number.isFinite(analysis.variants)).toBe(true);
    expect(describeVariants(analysis)).toContain("over");
  });

  it("flags an unclosed group", () => {
    const issues = analyzeSpintax("{Hi|Hello there").issues;
    expect(issues.some((i) => /Unclosed/.test(i.message))).toBe(true);
  });

  it("flags a stray closing brace", () => {
    expect(analyzeSpintax("Hello there}").issues.some((i) => /Unmatched/.test(i.message))).toBe(
      true
    );
  });

  it("flags an empty option, which silently drops a word from part of the send", () => {
    expect(analyzeSpintax("{hello||there}").issues.some((i) => /empty/i.test(i.message))).toBe(
      true
    );
  });

  it("flags a group with a single option as producing nothing", () => {
    expect(analyzeSpintax("{hello}").issues.some((i) => /one option/.test(i.message))).toBe(true);
  });

  it("finds nothing wrong with a well-formed template", () => {
    expect(analyzeSpintax("{Hi|Hello} {{first_name}}, {quick|short} question.").issues).toEqual([]);
  });

  it("still renders something usable from a broken template", () => {
    // Refusing to render the whole email over one typo is a worse trade than
    // sending it with a brace the author can see and fix.
    expect(expandSpintax("{Hi|Hello there", "seed")).not.toContain("|");
  });
});

describe("describeVariants", () => {
  it("says plainly when there is no variation at all", () => {
    expect(describeVariants(analyzeSpintax("plain text"))).toMatch(/byte-identical/);
  });

  it("counts versions for a varied template", () => {
    expect(describeVariants(analyzeSpintax("{a|b} {c|d}"))).toBe(
      "4 distinct versions of this email."
    );
  });

  it("explains a group that cannot vary", () => {
    expect(describeVariants(analyzeSpintax("{only}"))).toMatch(/at least two options/);
  });
});

describe("seededPicker", () => {
  it("is a stable sequence per seed", () => {
    const a = seededPicker("x");
    const b = seededPicker("x");
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b());
  });

  it("stays inside [0, 1)", () => {
    const pick = seededPicker("bounds");
    for (let i = 0; i < 500; i += 1) {
      const value = pick();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("never returns the same sequence for different seeds", () => {
    expect(seededPicker("a")()).not.toBe(seededPicker("b")());
  });
});

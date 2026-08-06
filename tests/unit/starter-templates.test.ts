import { describe, expect, it } from "vitest";
import { startersFor, STARTER_COUNT } from "@/lib/onboarding/starterTemplates";
import { analyzeSpintax } from "@/lib/personalization/spintax";
import { analyzeSpam } from "@/lib/spam/score";
import { listPlaceholders, PLACEHOLDERS } from "@/lib/personalization/render";
import type { WorkspaceProfile } from "@/schemas/user";

const USE_CASES: WorkspaceProfile["primaryUseCase"][] = [
  "SALES",
  "AGENCY",
  "RECRUITING",
  "FUNDRAISING",
  "PARTNERSHIPS",
  "CUSTOMER_SUCCESS",
  "OTHER",
];

describe("startersFor", () => {
  it("returns three templates for every workflow", () => {
    // Every use case has to get a matched third template, or someone who picks
    // Recruiting gets two generic ones and the matching was pointless.
    for (const useCase of USE_CASES) {
      expect(startersFor(useCase), useCase).toHaveLength(STARTER_COUNT);
    }
  });

  it("varies the third template by workflow", () => {
    const sales = startersFor("SALES").map((t) => t.name);
    const recruiting = startersFor("RECRUITING").map((t) => t.name);
    expect(sales).not.toEqual(recruiting);
    // The two universal ones are shared.
    expect(sales.filter((n) => recruiting.includes(n))).toHaveLength(2);
  });

  it("gives every template a name, subject, body, and explanation", () => {
    for (const template of startersFor("SALES")) {
      expect(template.name.length).toBeGreaterThan(3);
      expect(template.subjectTemplate.length).toBeGreaterThan(5);
      expect(template.htmlTemplate.length).toBeGreaterThan(100);
      // The description is what tells a new user which one to open first.
      expect(template.description.length).toBeGreaterThan(30);
      expect(template.type).toBe("STARTER");
    }
  });
});

describe("every starter is fit to send", () => {
  const all = USE_CASES.flatMap((useCase) => startersFor(useCase));

  it("carries the placeholders campaign launch requires", () => {
    // A starter that failed the product's own launch check would teach a new
    // user, on their first campaign, that the product is broken.
    for (const template of all) {
      expect(template.htmlTemplate, template.name).toContain("{{unsubscribe_text}}");
      expect(template.htmlTemplate, template.name).toContain("{{physical_address}}");
    }
  });

  it("uses only placeholders that actually exist", () => {
    // A typo here renders as literal {{frist_name}} in a real customer email.
    for (const template of all) {
      const used = [
        ...listPlaceholders(template.htmlTemplate),
        ...listPlaceholders(template.subjectTemplate),
      ];
      for (const name of used) {
        expect(PLACEHOLDERS, `${template.name} uses {{${name}}}`).toContain(name);
      }
    }
  });

  it("demonstrates variation, since it is the first template anyone opens", () => {
    for (const template of all) {
      const analysis = analyzeSpintax(`${template.subjectTemplate} ${template.htmlTemplate}`);
      expect(analysis.variants, template.name).toBeGreaterThan(1);
      // And the syntax has to be well formed, or the starters teach the wrong
      // thing and the spam panel flags the product's own content.
      expect(analysis.issues, template.name).toEqual([]);
    }
  });

  it("scores well on the product's own spam checker", () => {
    // Shipping a starter that scores a C would be an odd first impression.
    for (const template of all) {
      const result = analyzeSpam({
        subject: template.subjectTemplate,
        html: template.htmlTemplate,
        hasUnsubscribe: true,
        hasPhysicalAddress: true,
      });
      expect(result.score, `${template.name} scored ${result.score}`).toBeGreaterThanOrEqual(85);
      expect(result.grade, template.name).toBe("A");
    }
  });

  it("has no failing spam check at all", () => {
    for (const template of all) {
      const failures = analyzeSpam({
        subject: template.subjectTemplate,
        html: template.htmlTemplate,
        hasUnsubscribe: true,
        hasPhysicalAddress: true,
      }).checks.filter((c) => c.status === "fail");
      expect(failures.map((f) => f.label), template.name).toEqual([]);
    }
  });

  it("prompts the writer to replace the generic paragraph", () => {
    // These are scaffolds, not send-as-is copy. If a starter reads as finished,
    // someone will send it verbatim to five hundred strangers.
    for (const template of startersFor("SALES")) {
      expect(template.htmlTemplate.toLowerCase(), template.name).toContain("replace this");
    }
  });

  it("leaves the recipient an easy way to decline", () => {
    // A cold email that makes declining awkward earns complaints, and
    // complaints are the signal that actually costs a sending domain. Matching
    // the property rather than one word: "say so and I will stop there" invites
    // a no perfectly well without containing the word.
    const invitesDecline =
      /\bno\b|not a priority|timing is wrong|leave you alone|leave it|stop there|not for you|tell me/i;
    for (const template of all) {
      expect(
        invitesDecline.test(template.htmlTemplate),
        `${template.name} should give the reader an easy out`
      ).toBe(true);
    }
  });
});

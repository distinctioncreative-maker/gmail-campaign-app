import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
/** Source with comments stripped, because these rules are about what renders. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SECTIONS = "components/marketing/sections";
const files = readdirSync(SECTIONS).filter((f) => f.endsWith(".tsx"));
const landing = read("components/marketing/Landing.tsx");

/**
 * The landing page is a shell over its bands, not one file holding all of them.
 *
 * Landing.tsx was 876 lines: nine bands, four helper components, three data
 * tables and the page shell in one scroll. Changing the pricing copy meant
 * passing the hero, the workflow and the trust band on the way, and each of
 * those was a chance to edit the wrong thing. Size is not the complaint on its
 * own; the complaint is that nothing in the file told you where one band ended
 * and the next began, so every edit was made in the wrong unit.
 *
 * These rules keep it split. They are about structure, not line count, because
 * a line-count rule is satisfied by moving code somewhere worse.
 */
describe("the marketing page stays a shell over its bands", () => {
  it("has a band file per band, and finds them", () => {
    expect(files.length).toBe(9);
    for (const expected of [
      "Hero.tsx", "Intro.tsx", "Workflow.tsx", "Features.tsx", "Trust.tsx",
      "Outcome.tsx", "Pricing.tsx", "Faq.tsx", "FinalCta.tsx",
    ]) {
      expect(files, expected).toContain(expected);
    }
  });

  it("keeps the shell free of band markup", () => {
    // The shell owns the skip link, the nav, the order and the footer. A
    // <section> here is a band that started growing back into it.
    expect(code(landing)).not.toMatch(/<section\b/);
    // And it renders every band, in one place, so the order is readable.
    for (const f of files) {
      const name = f.replace(".tsx", "");
      expect(landing, name).toContain(`<${name} />`);
      expect(landing, name).toContain(`from "./sections/${name}"`);
    }
  });

  it("gives each band exactly one band element", () => {
    for (const f of files) {
      const source = code(read(`${SECTIONS}/${f}`));
      const bands = [...source.matchAll(/<(section|header)\b/g)].length;
      expect(bands, `${f} should contain exactly one band`).toBe(1);
    }
  });

  it("keeps each band's own data with it, not in a shared bucket", () => {
    // WORKFLOW, FEATURES and FAQ are each used by exactly one band. Left in a
    // shared file they become "constants", which is where things go to be
    // edited by people who cannot see what renders them.
    const shared = read("components/marketing/shared.tsx");
    for (const table of ["WORKFLOW", "FEATURES", "FAQ"]) {
      expect(shared, table).not.toMatch(new RegExp(`const ${table}\\b`));
      const owners = files.filter((f) =>
        new RegExp(`const ${table}\\b`).test(read(`${SECTIONS}/${f}`))
      );
      expect(owners, `${table} should live in exactly one band`).toHaveLength(1);
    }
  });

  it("shares only what more than one band uses", () => {
    const shared = read("components/marketing/shared.tsx");
    const exported = [...shared.matchAll(/export (?:function|const) (\w+)/g)].map(
      ([, n]) => n
    );
    expect(exported.length).toBeGreaterThan(4);
    for (const name of exported) {
      const consumers = [...files.map((f) => `${SECTIONS}/${f}`), "components/marketing/Landing.tsx"]
        .filter((p) => new RegExp(`\\b${name}\\b`).test(read(p)));
      expect(
        consumers.length,
        `${name} is exported from shared.tsx but used by ${consumers.length} file(s)`
      ).toBeGreaterThan(0);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("managed-pilot legal surfaces", () => {
  it("links every public policy from the landing page", () => {
    const landing = read("components/marketing/Landing.tsx");
    for (const route of ["/terms", "/privacy", "/acceptable-use", "/compliance"]) {
      expect(landing).toContain(`href=\"${route}\"`);
    }
  });

  it("does not make the commercial footer requirements optional", () => {
    const compliance = read("app/compliance/page.tsx");
    expect(compliance).toContain("does not offer a switch that removes the address or opt-out");
    expect(compliance).toContain("Campaign launch fails closed");
  });

  it("keeps unresolved legal identity facts in the signed order form", () => {
    const shell = read("components/legal/LegalPage.tsx");
    expect(shell).toContain("operating entity");
    expect(shell).toContain("governing law");
  });
});

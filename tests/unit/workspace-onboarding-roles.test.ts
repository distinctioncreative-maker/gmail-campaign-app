import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CustomRoleDefinitionSchema, WorkspaceProfileSchema } from "@/schemas/user";

describe("workspace onboarding and custom roles", () => {
  it("validates the workspace context without turning volume into a send limit", () => {
    expect(
      WorkspaceProfileSchema.parse({
        industry: "Professional services",
        teamSize: "6_20",
        monthlyEmailGoal: "2001_10000",
        primaryUseCase: "AGENCY",
        configuredAt: 123,
      })
    ).toMatchObject({ industry: "Professional services", primaryUseCase: "AGENCY" });
    expect(() => WorkspaceProfileSchema.parse({ teamSize: "500_PLUS" })).toThrow();
  });

  it("keeps custom names separate from the audited permission level", () => {
    const role = CustomRoleDefinitionSchema.parse({
      id: "strategist",
      name: "Account strategist",
      description: "Owns campaign planning",
      baseRole: "MANAGER",
    });
    expect(role.name).toBe("Account strategist");
    expect(role.baseRole).toBe("MANAGER");
    expect(() => CustomRoleDefinitionSchema.parse({ ...role, baseRole: "OWNER" })).toThrow();
  });

  it("keeps setup and tour motion accessible and optional", () => {
    const onboarding = readFileSync("components/OnboardingWizard.tsx", "utf8");
    const tour = readFileSync("components/tour/ProductTour.tsx", "utf8");
    const styles = readFileSync("app/globals.css", "utf8");
    expect(onboarding).toContain("Planned outreach per month");
    expect(onboarding).toContain("They never bypass Gmail, plan, or safety limits");
    expect(tour).toContain('event.key === "Escape"');
    expect(tour).toContain('event.key !== "Tab"');
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".tour-signal-pulse");
  });
});

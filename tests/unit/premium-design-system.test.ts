import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("premium shared design system", () => {
  it("keeps navigation typography-first across public and app chrome", () => {
    expect(read("components/marketing/Landing.tsx")).toContain(
      '<Wordmark descriptor="Outreach OS" />'
    );
    expect(read("components/Sidebar.tsx")).toContain(
      '<Wordmark descriptor="Outreach OS" />'
    );
    expect(read("app/(dashboard)/layout.tsx")).toContain("<Wordmark />");
  });

  it("maintains practical mobile touch targets", () => {
    expect(read("app/globals.css")).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?min-height: 44px;/
    );
    expect(read("components/MobileNav.tsx")).toContain("min-h-14");
    expect(read("components/MobileNav.tsx")).toContain("min-h-11 min-w-11");
  });

  it("makes account switching and sign-out explicit, accessible, and unclipped", () => {
    const accountMenu = read("components/AccountMenu.tsx");
    const sidebar = read("components/Sidebar.tsx");
    const mobileNav = read("components/MobileNav.tsx");

    expect(accountMenu).toContain("Switch or sign out");
    expect(accountMenu).toContain("account menu. Switch account or sign out.");
    expect(accountMenu).toContain('aria-label="Account actions"');
    expect(accountMenu).toContain("max-h-[calc(100vh-2rem)]");
    expect(accountMenu).toContain("text-danger");
    expect(accountMenu).toContain("hover:bg-danger-soft");
    expect(accountMenu).not.toMatch(/text-red-(?:400|600)|hover:bg-red-50/);
    expect(sidebar).toContain('placement="side"');
    expect(mobileNav).toContain('placement="inline"');
    expect(existsSync("components/SignOutButton.tsx")).toBe(false);
  });

  it("uses the shared icon language instead of decorative emoji in core journeys", () => {
    const coreSources = [
      "components/OnboardingWizard.tsx",
      "components/tour/ProductTour.tsx",
      "components/imports/ImportChooser.tsx",
      "components/TestCenter.tsx",
      "components/campaign/CampaignWizard.tsx",
      "components/templates/AiEmailWriter.tsx",
      "components/sequences/AiSequenceWriter.tsx",
      "app/(dashboard)/home/page.tsx",
      "app/(dashboard)/replies/page.tsx",
    ].map(read).join("\n");

    for (const emoji of ["✨", "🔥", "🎉", "👋", "🚀", "✅", "⚠️", "🛡️"]) {
      expect(coreSources).not.toContain(emoji);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
  "components/marketing/Landing.tsx",
  "utf8"
);
const landingStyles = readFileSync(
  "components/marketing/landing.module.css",
  "utf8"
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("landing-page experience", () => {
  it("keeps the top-right pilot action readable above the global link rule", () => {
    expect(landingStyles).toMatch(
      /\.root \.navPilot \{[\s\S]*?color: #07111f;/
    );
    expect(contrastRatio("#07111f", "#eaf2ff")).toBeGreaterThanOrEqual(4.5);
    expect(landingSource).toContain("Request a pilot <Arrow />");
  });

  it("centers and focuses the pilot email field from every shared CTA", () => {
    expect(landingSource).toContain("function PilotLink");
    expect(landingSource).toContain('block: "center"');
    expect(landingSource).toContain('"scrollend"');
    expect(landingSource).toContain("fallback = window.setTimeout");
    expect(landingSource).toContain("input.focus()");
    expect(landingSource).toContain("aria-controls={PILOT_EMAIL_ID}");
    expect(landingSource.match(/<PilotLink/g)?.length).toBeGreaterThanOrEqual(3);
    expect(landingStyles).toMatch(
      /\.pilotAnchor \{[\s\S]*?scroll-margin-top: 96px;/
    );
  });

  it("makes the hero walkthrough user controlled and keyboard operable", () => {
    expect(landingSource).toContain("const HERO_DEMO_STAGES");
    expect(landingSource).toContain('role="tablist"');
    expect(landingSource).toContain('role="tab"');
    expect(landingSource).toContain("Pause walkthrough");
    expect(landingSource).toContain("setPlaying(false)");
    expect(landingSource).toContain('event.key === "ArrowRight"');
    expect(landingSource).toContain('event.key === "ArrowLeft"');
    expect(landingSource).toContain("IntersectionObserver");
    expect(landingSource).toContain("Interactive example");
  });

  it("keeps demo interactions deterministic and away from production APIs", () => {
    const fetches = landingSource.match(/fetch\(/g) ?? [];
    expect(fetches).toHaveLength(1);
    expect(landingSource).toContain('fetch("/api/waitlist"');
    expect(landingSource).toMatch(
      /This example control does not send email or change a real\s+account\./
    );
    expect(landingSource).toContain("Example data, last");
  });

  it("supports before-and-after AI copy, variants, and human approval", () => {
    expect(landingSource).toContain("Before AI");
    expect(landingSource).toContain("AI-assisted");
    expect(landingSource).toContain("Brand voice");
    expect(landingSource).toContain("Human review required");
    expect(landingSource).toContain("Approve draft");
  });

  it("leads with a strong but qualified business outcome", () => {
    expect(landingSource).toContain(
      "Turn Gmail outreach into qualified conversations."
    );
    expect(landingSource).toContain(
      "No platform can guarantee inbox placement or replies."
    );
    expect(landingSource).toContain(
      "Provider limits are ceilings, not a universal target."
    );
  });

  it("turns off decorative animation for reduced-motion users", () => {
    expect(landingSource).toContain(
      '"(prefers-reduced-motion: reduce)"'
    );
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none !important;/
    );
  });

  it("uses fluid mobile layouts and practical touch targets", () => {
    expect(landingStyles).toContain("@media (max-width: 980px)");
    expect(landingStyles).toContain("@media (max-width: 720px)");
    expect(landingStyles).toContain("@media (max-width: 520px)");
    expect(landingStyles).toMatch(
      /\.demoStageTabs button \{[\s\S]*?min-height: 52px;/
    );
    expect(landingStyles).toMatch(
      /\.operationsTabs button \{[\s\S]*?min-height: 44px;/
    );
  });
});

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

  it("pairs the animated workflow with a non-visual description", () => {
    expect(landingSource).toContain("const DEMO_FLOW");
    expect(landingSource).toContain(
      "Example campaign flow: leads verified, AI draft reviewed,"
    );
  });

  it("turns off decorative animation for reduced-motion users", () => {
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none !important;/
    );
  });
});

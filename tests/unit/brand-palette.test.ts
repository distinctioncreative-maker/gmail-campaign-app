import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globals = readFileSync("app/globals.css", "utf8");
const lightBlock = globals.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? "";
const darkBlock = globals.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";

function token(block: string, name: string): string {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing hex token --${name}`);
  return value;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("plum and editorial-blue brand palette", () => {
  it("records the selected semantic roles and identity gradient", () => {
    expect(token(lightBlock, "primary")).toBe("#72506f");
    expect(token(lightBlock, "primary-hover")).toBe("#5e405b");
    expect(token(lightBlock, "primary-soft")).toBe("#f4edf3");
    expect(token(lightBlock, "info")).toBe("#456a8d");
    expect(token(lightBlock, "info-hover")).toBe("#355674");
    expect(token(lightBlock, "info-soft")).toBe("#eaf1f7");
    expect(token(lightBlock, "brand-from")).toBe("#72506f");
    expect(token(lightBlock, "brand-to")).toBe("#456a8d");
  });

  it("keeps primary and information text and fills at WCAG AA contrast", () => {
    const paper = token(lightBlock, "background");
    const surface = token(lightBlock, "surface");
    const primary = token(lightBlock, "primary");
    const primarySoft = token(lightBlock, "primary-soft");
    const primaryContrast = token(lightBlock, "primary-contrast");
    const info = token(lightBlock, "info");
    const infoSoft = token(lightBlock, "info-soft");
    const infoContrast = token(lightBlock, "info-contrast");
    const brandContrast = token(lightBlock, "brand-contrast");

    for (const ratio of [
      contrast(primary, paper),
      contrast(primary, surface),
      contrast(primary, primarySoft),
      contrast(primaryContrast, primary),
      contrast(info, paper),
      contrast(info, surface),
      contrast(info, infoSoft),
      contrast(infoContrast, info),
      contrast(brandContrast, token(lightBlock, "brand-from")),
      contrast(brandContrast, token(lightBlock, "brand-to")),
    ]) {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses lifted dark-theme accents with dedicated readable fill text", () => {
    const background = token(darkBlock, "background");
    const surface = token(darkBlock, "surface");
    const primary = token(darkBlock, "primary");
    const primarySoft = token(darkBlock, "primary-soft");
    const primaryContrast = token(darkBlock, "primary-contrast");
    const info = token(darkBlock, "info");
    const infoSoft = token(darkBlock, "info-soft");
    const infoContrast = token(darkBlock, "info-contrast");
    const brandContrast = token(darkBlock, "brand-contrast");

    for (const ratio of [
      contrast(primary, background),
      contrast(primary, surface),
      contrast(primary, primarySoft),
      contrast(primaryContrast, primary),
      contrast(info, background),
      contrast(info, surface),
      contrast(info, infoSoft),
      contrast(infoContrast, info),
      contrast(brandContrast, token(darkBlock, "brand-from")),
      contrast(brandContrast, token(darkBlock, "brand-to")),
    ]) {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps body, muted, status, and revenue text readable in both themes", () => {
    for (const block of [lightBlock, darkBlock]) {
      const background = token(block, "background");
      const surface = token(block, "surface");
      for (const foreground of [
        token(block, "foreground"),
        token(block, "muted"),
        token(block, "success"),
        token(block, "warning"),
        token(block, "danger"),
        token(block, "revenue"),
      ]) {
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(foreground, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(token(block, "success-contrast"), token(block, "success"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, "warning-contrast"), token(block, "warning"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, "danger-contrast"), token(block, "danger"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps direct palette utilities and retired electric indigo out of product source", () => {
    const sources = sourceFiles("app")
      .concat(sourceFiles("components"), sourceFiles("lib"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(
      /\b(?:bg|text|border|from|to|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|purple|indigo|violet|fuchsia|pink|rose|white|black)-\d+\b/
    );
    expect(sources).not.toMatch(/\btext-muted\/(?:50|60|70)\b/);
    expect(sources).not.toMatch(/#(?:5b47e0|4a37cc|6c55ea|9b5cd6|8b78ff|a394ff|7c5cff)\b/i);
    expect(sources).not.toMatch(/bg-primary[^"\n]*text-white/);
    expect(sources).not.toMatch(/brand-gradient[^"\n]*text-white/);
  });

  it("uses blue for AI and information while plum remains the action lane", () => {
    const aiSources = [
      "components/templates/AiEmailWriter.tsx",
      "components/templates/AiEmailTools.tsx",
      "components/sequences/AiSequenceWriter.tsx",
      "components/campaign/CampaignWizard.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const landing = readFileSync("components/marketing/landing.module.css", "utf8");

    expect(aiSources).toContain("bg-info-soft");
    expect(aiSources).toContain("text-info");
    expect(aiSources).toContain("btn-primary");
    expect(landing).toContain("--landing-info: var(--marketing-info)");
    expect(landing).toContain("--landing-blue: var(--marketing-primary)");
    expect(landing).toContain("var(--landing-blue)");
    expect(landing).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

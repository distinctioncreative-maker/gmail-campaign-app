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

describe("cool neutral brand palette", () => {
  it("records the selected semantic roles and identity gradient", () => {
    expect(token(lightBlock, "primary")).toBe("#2354c7");
    expect(token(lightBlock, "primary-hover")).toBe("#1b429e");
    expect(token(lightBlock, "primary-soft")).toBe("#e6ecfa");
    // Two accents, two meanings: blue is clickable, green is finished or
    // working. Money is an outcome, so it shares the green rather than
    // introducing a third hue that would dilute both signals.
    expect(token(lightBlock, "revenue")).toBe(token(lightBlock, "success"));
    expect(token(darkBlock, "revenue")).toBe(token(darkBlock, "success"));
    // `info` is a cool slate neutral, not a second brand colour.
    expect(token(lightBlock, "info")).toBe("#3e4a5c");
    expect(token(lightBlock, "info-soft")).toBe("#e7eaef");
    expect(token(lightBlock, "brand-from")).toBe("#2354c7");
    expect(token(lightBlock, "brand-to")).toBe("#0f1729");
  });

  it("keeps one accent across two grounds: near-white in light, navy in dark", () => {
    expect(token(lightBlock, "background")).toBe("#f1f4f8");
    // The dark ground is asserted by its properties rather than by its exact
    // hex. It used to be pinned to #0b0f17, which made this test fail the first
    // time the ground was legitimately deepened for the new elevation ladder,
    // and a literal that has to be edited every time the palette is tuned is
    // not protecting anything: it just relocates the decision into a diff.
    //
    // What actually matters is what the name promises. It has to be dark enough
    // to be a dark theme, and navy rather than neutral grey or warm, because the
    // whole palette is built on a cool family and a warm dark ground would put
    // the accents out of key. Current value: #070b12.
    const darkGround = token(darkBlock, "background");
    expect(darkGround).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(darkGround.slice(i, i + 2), 16));
    expect(Math.max(r, g, b), "dark ground stays genuinely dark").toBeLessThan(0x22);
    expect(b, "dark ground is navy, not neutral or warm").toBeGreaterThan(r);
    for (const block of [lightBlock, darkBlock]) {
      // The accent must stay clearly separable from body and muted text, which
      // is the failure that made an earlier plum accent invisible as an action.
      const primary = token(block, "primary");
      expect(primary).not.toBe(token(block, "muted"));
      expect(contrast(primary, token(block, "background"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(primary, token(block, "surface"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("separates the card from the page and gives the hairline an edge", () => {
    // The previous ivory ramp sat a card 1.06:1 against the page with a
    // 1.29:1 hairline, which is why nothing on screen looked like an object.
    for (const block of [lightBlock, darkBlock]) {
      const surface = token(block, "surface");
      expect(contrast(surface, token(block, "background"))).toBeGreaterThanOrEqual(1.08);
      expect(contrast(token(block, "border"), surface)).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("keeps navy bands readable and in the cool family", () => {
    for (const block of [lightBlock, darkBlock]) {
      const ink = token(block, "ink");
      expect(contrast(token(block, "on-ink"), ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, "on-ink-muted"), ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, "brass-on-ink"), ink)).toBeGreaterThanOrEqual(4.5);
    }
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

  it("keeps every progress-bar fill visible against its own track", () => {
    // Three bars shipped with the fill and the track set to the same token.
    // Two of them measured 1.00:1, which is not a subtle bar: it is no bar at
    // all. A green test suite proved they compiled, not that they were
    // legible, so the rule is encoded here instead.
    //
    // Rule: the track is always --surface-2; the fill is always a status or
    // action colour. Green means progress toward completion, blue means the
    // magnitude of a value next to its peers.
    const allowedFills = new Set(["bg-success", "bg-primary", "bg-revenue", "bg-danger", "bg-warning"]);
    const bars: Array<{ path: string; track: string; fill: string }> = [];

    for (const path of sourceFiles("app").concat(sourceFiles("components"))) {
      if (!path.endsWith(".tsx")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/style=\{\{\s*width:/g)) {
        const preceding = source.slice(Math.max(0, match.index - 400), match.index);
        const backgrounds = [...preceding.matchAll(/\bbg-[a-z0-9/[\]-]+/g)].map((m) => m[0]);
        if (backgrounds.length < 2) continue;
        bars.push({
          path,
          track: backgrounds[backgrounds.length - 2],
          fill: backgrounds[backgrounds.length - 1],
        });
      }
    }

    // Guard the guard: if the markup shape changes so nothing matches, this
    // test must fail loudly rather than pass vacuously.
    expect(bars.length).toBeGreaterThanOrEqual(12);
    for (const bar of bars) {
      expect(`${bar.path}: ${bar.fill} on ${bar.track}`).toBe(
        `${bar.path}: ${bar.fill} on bg-surface-2`
      );
      expect(`${bar.path}: ${bar.fill}`).toBe(
        `${bar.path}: ${allowedFills.has(bar.fill) ? bar.fill : "an allowed status or action fill"}`
      );
    }
  });

  it("keeps direct palette utilities and retired identity colours out of product source", () => {
    const sources = sourceFiles("app")
      .concat(sourceFiles("components"), sourceFiles("lib"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(
      /\b(?:bg|text|border|from|to|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|purple|indigo|violet|fuchsia|pink|rose|white|black)-\d+\b/
    );
    expect(sources).not.toMatch(/\btext-muted\/(?:50|60|70)\b/);
    // Retired identity colours, newest first: the ivory-and-brass pair, the
    // plum before it, and the electric indigo before that.
    expect(sources).not.toMatch(
      /#(?:856428|6f5426|f5eee0|c9a45c|d2a961|e3be7c|b8904a|2b2419|3a3122|f7f4ed|faf9f7|f2f0ec|e5e2da|5c574e|14130f|4a4034|5b47e0|4a37cc|6c55ea|9b5cd6|8b78ff|a394ff|7c5cff|72506f|5e405b|c7a8c4|456a8d|8eb4d2)\b/i
    );
    expect(sources).not.toMatch(/bg-primary[^"\n]*text-white/);
    expect(sources).not.toMatch(/brand-gradient[^"\n]*text-white/);
  });

  it("keeps AI on the neutral slate lane while blue owns actions", () => {
    const aiSources = [
      "components/templates/AiEmailWriter.tsx",
      "components/templates/AiEmailTools.tsx",
      "components/sequences/AiSequenceWriter.tsx",
      "components/campaign/CampaignWizard.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    // Comments stripped, same as the equivalent check in
    // landing-experience.test.ts. The rule is that no *declaration* carries a
    // literal colour; a comment recording the hex a token wrongly resolved to,
    // and why that mattered, is documentation. Banning it means a fix cannot
    // explain itself in the file it fixes, and both copies of this assertion
    // failed the moment such a note was written.
    const landing = readFileSync("components/marketing/landing.module.css", "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );

    expect(aiSources).toContain("bg-info-soft");
    expect(aiSources).toContain("text-info");
    expect(aiSources).toContain("btn-primary");
    expect(landing).toContain("--landing-info: var(--marketing-info)");
    expect(landing).toContain("--landing-blue: var(--marketing-primary)");
    expect(landing).toContain("var(--landing-blue)");
    expect(landing).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // A hex ban alone let ~50 cold-blue and green rgb() literals survive the
    // last migration, hidden inside shadows, glows, and gradients. Any
    // non-neutral rgb() is a colour the palette does not control. Neutral
    // scrims (equal channels) and the one canonical shadow are allowed.
    const colouredRgb = [...landing.matchAll(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/g)].filter(
      ([, r, g, b]) => !(r === g && g === b) && !(r === "15" && g === "23" && b === "41")
    );
    expect(colouredRgb).toHaveLength(0);
  });
});

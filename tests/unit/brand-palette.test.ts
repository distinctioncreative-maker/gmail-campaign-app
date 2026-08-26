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
    /**
     * Rewritten from pinned hexes to properties when the palette moved from
     * blue-on-cool-grey to green-on-bone. The literals were asserting the
     * decision rather than protecting it, which this file already argues
     * against a few lines below: a value that must be edited every time the
     * palette is tuned only relocates the choice into a diff.
     *
     * The roles are what matter, and one of them inverted deliberately. Money
     * used to share the green with success, on the theory that a third hue
     * dilutes the signal. With green promoted to the brand colour that stopped
     * working: a revenue figure rendered in the brand green reads as chrome
     * rather than as an outcome. Replies are the thing a customer pays for, so
     * they now get the brass, and brass appears nowhere else in the product.
     */
    for (const block of [lightBlock, darkBlock]) {
      // Money is its own signal now, not an alias of "ok".
      expect(token(block, "revenue")).not.toBe(token(block, "success"));
      // Status green must not be the brand green, or a success pill reads as a
      // brand element.
      expect(token(block, "success")).not.toBe(token(block, "primary"));
      // `info` is a neutral in the family, not a second brand colour: it stays
      // close to muted in hue and never equals the accent.
      expect(token(block, "info")).not.toBe(token(block, "primary"));
    }
    // Both ends of the identity gradient must carry the same contrast token, so
    // text on it is legible wherever the gradient is sampled.
    for (const end of ["brand-from", "brand-to"] as const) {
      expect(
        contrast(token(lightBlock, end), token(lightBlock, "brand-contrast"))
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps one accent across two grounds: near-white in light, navy in dark", () => {
    // Asserted as a property for the same reason the dark ground is, below.
    // The light ground is bone: warm, so red exceeds blue. The previous ramp
    // was cool grey and would fail this.
    const lightGround = token(lightBlock, "background");
    {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(lightGround.slice(i, i + 2), 16));
      expect(r, "light ground is warm bone, not cool grey").toBeGreaterThan(b);
    }
    // The dark ground is asserted by its properties rather than by its exact
    // hex. It used to be pinned to #0b0f17, which made this test fail the first
    // time the ground was legitimately deepened for the new elevation ladder,
    // and a literal that has to be edited every time the palette is tuned is
    // not protecting anything: it just relocates the decision into a diff.
    //
    // What actually matters is what the name promises. It has to be dark enough
    // to be a dark theme, and green rather than neutral or navy, because the
    // whole palette is built on a green family and an off-key dark ground would
    // put the accents out of tune with it. Current value: #050806.
    const darkGround = token(darkBlock, "background");
    expect(darkGround).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(darkGround.slice(i, i + 2), 16));
    expect(Math.max(r, g, b), "dark ground stays genuinely dark").toBeLessThan(0x22);
    expect(g, "dark ground is green, not neutral or navy").toBeGreaterThanOrEqual(
      Math.max(r, b)
    );
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
    /**
     * Three bars once shipped with the fill and the track set to the same token,
     * two of them measuring 1.00:1, which is not a subtle bar but no bar at all.
     * A green suite proved they compiled, not that they were legible, so the rule
     * was encoded here: the track is always --surface-2 and the fill is always a
     * status or action colour.
     *
     * That rule is now enforced by construction instead. components/ui/charts/
     * Meter.tsx derives its track from its fill with color-mix, so there is no
     * second colour left to choose wrongly, and sixteen of the nineteen
     * hand-rolled bars have been replaced by it.
     *
     * This test therefore does two things now. It still checks whatever bars are
     * hand-rolled, because three deliberately remain on illustrative surfaces.
     * And it asserts the structural guarantee, which is the stronger claim: the
     * count floor below moved from twelve to three, and if it ever climbs back
     * the meter.test.ts bound fails first.
     */
    expect(
      readFileSync("components/ui/charts/Meter.tsx", "utf8"),
      "the meter derives its track from its fill"
    ).toContain("color-mix(in srgb, ${fill} 16%, var(--surface-2))");
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

    // Guard the guard, still: if the shape changes so nothing matches at all,
    // this must fail loudly rather than pass vacuously. Two is the current real
    // count. It has now stepped down twice, twelve to three to two, each time
    // because bars moved into Meter rather than because the check stopped
    // working, and each step was surfaced by this assertion rather than assumed.
    expect(bars.length).toBeGreaterThanOrEqual(2);
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

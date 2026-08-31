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

/**
 * LCH, because contrast alone cannot see the failure that produced this
 * palette. Every pair in the previous system passed WCAG, and the system was
 * still wrong: the neutrals were yellow, the accent was yellow, and the
 * warning state was the same yellow as the accent. Contrast measures one pair
 * at a time. Chroma and hue measure whether the palette is a system.
 */
function lch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x / 0.95047), f(y), f(z / 1.08883)];
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return {
    l: 116 * fy - 16,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

/** Shortest angular distance between two hues, in degrees. */
function hueGap(one: string, two: string): number {
  const gap = Math.abs(lch(one).h - lch(two).h);
  return Math.min(gap, 360 - gap);
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

describe("neutral brand palette with one accent", () => {
  it("records the selected semantic roles and identity gradient", () => {
    /**
     * Rewritten from pinned hexes to properties when the palette moved from
     * blue-on-cool-grey to green-on-bone. The literals were asserting the
     * decision rather than protecting it, which this file already argues
     * against a few lines below: a value that must be edited every time the
     * palette is tuned only relocates the choice into a diff.
     *
     * The roles are what matter, and they have now inverted twice. Money first
     * shared the green with success, then took the brass when green became the
     * brand colour. It is the copy colour now, because the palette went
     * monochrome and there is no longer a brand hue for a figure to be confused
     * with: a total set in plain black reads as a number rather than as a
     * branded element, which is how every financial interface worth copying
     * sets one.
     *
     * The rule underneath all three revisions is the same. Every role that
     * means something different must LOOK different from the roles next to it,
     * and that is what is asserted rather than any particular colour.
     */
    for (const block of [lightBlock, darkBlock]) {
      // Money is its own signal, not an alias of "ok".
      expect(token(block, "revenue")).not.toBe(token(block, "success"));
      // Status must not be the action colour, or a success pill reads as a
      // brand element.
      expect(token(block, "success")).not.toBe(token(block, "primary"));
      // The accent lane and the action lane are different things: `info` marks
      // the product speaking, `primary` marks something you can click.
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

  it("keeps one action colour across two grounds, achromatic in both", () => {
    /**
     * The light ground must be NEUTRAL, and this assertion is the reverse of
     * what it said one palette ago.
     *
     * It used to require a warm ground, red above blue, on the theory that
     * bone is friendlier than grey. Measured in LCH the result was a ramp at
     * chroma 2.1 to 7.1 sitting at hue 90, which is yellow: the page, the
     * rules and the body text were all faintly gold, underneath a gold accent
     * and beside a gold warning state. A warm accent cannot read as an accent
     * on a warm field, because nothing separates it from the field.
     *
     * So the requirement is now the thing that was actually load-bearing all
     * along, and the ground being warm was never it.
     */
    const lightGround = token(lightBlock, "background");
    {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(lightGround.slice(i, i + 2), 16));
      expect(
        Math.max(r, g, b) - Math.min(r, g, b),
        "light ground is neutral, not tinted"
      ).toBeLessThanOrEqual(4);
    }
    // The dark ground is asserted by its properties rather than by its exact
    // hex. It used to be pinned to #0b0f17, which made this test fail the first
    // time the ground was legitimately deepened for the new elevation ladder,
    // and a literal that has to be edited every time the palette is tuned is
    // not protecting anything: it just relocates the decision into a diff.
    //
    // It has to be dark enough to be a dark theme, and now also achromatic:
    // the previous version of this assertion required the ground to be GREEN,
    // which is exactly the kind of rule that has to be rewritten rather than
    // satisfied when the palette changes underneath it. What survives is the
    // part that was always the real requirement.
    const darkGround = token(darkBlock, "background");
    expect(darkGround).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(darkGround.slice(i, i + 2), 16));
    expect(Math.max(r, g, b), "dark ground stays genuinely dark").toBeLessThan(0x22);
    expect(
      Math.max(r, g, b) - Math.min(r, g, b),
      "dark ground is achromatic, not a tinted brand ground"
    ).toBeLessThanOrEqual(6);

    // The action colour is achromatic in both themes. This is the load-bearing
    // property of the whole palette: a coloured primary is what put the last
    // accent on every button, link, ring and chart in the product, which is
    // what made it read as one colour rather than as a design.
    for (const block of [lightBlock, darkBlock]) {
      const primary = token(block, "primary");
      const [pr, pg, pb] = [1, 3, 5].map((i) => parseInt(primary.slice(i, i + 2), 16));
      expect(
        Math.max(pr, pg, pb) - Math.min(pr, pg, pb),
        "the action colour carries no hue"
      ).toBeLessThanOrEqual(10);
      // It must stay clearly separable from body and muted text, which is the
      // failure that made an earlier plum accent invisible as an action.
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

  it("keeps the dark bands readable", () => {
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

  it("keeps AI on the accent lane while black owns actions", () => {
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
    expect(landing).toContain("--landing-action: var(--marketing-primary)");
    expect(landing).toContain("var(--landing-action)");
    expect(landing).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    /**
     * Every rgb() in a declaration must be a neutral scrim, meaning equal
     * channels. Anything else is a colour the palette does not control.
     *
     * This assertion previously carried an exemption:
     *
     *     && !(r === "15" && g === "23" && b === "41")
     *
     * which is `rgb(15 23 41)`, the ink of a palette two generations back,
     * hardcoded on the sticky nav. So the one literal hue in the entire file
     * was the one thing this rule was written to permit, and the nav went on
     * rendering the old blue through a green repalette and out to production,
     * where the owner saw it before any test did.
     *
     * The lesson is not about that hex. An exemption added to make a rule pass
     * is a note saying "this rule does not cover the case it was written for",
     * and it will still be there long after everyone has forgotten which case.
     * If a literal genuinely has to exist, it belongs in a token.
     */
    const colouredRgb = [...landing.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)].filter(
      ([, r, g, b]) => !(r === g && g === b)
    );
    expect(colouredRgb.map((m) => m[0])).toEqual([]);
    // Floor: neutral scrims do still exist here, so the filter above is
    // actually filtering rather than matching nothing at all.
    expect(
      [...landing.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)].length
    ).toBeGreaterThanOrEqual(4);
  });
});

/**
 * The three rules that would have caught the palette this one replaced.
 *
 * Every pair in that system passed WCAG AA. It still looked, in the owner's
 * words, thrown together, and the measurements said exactly why:
 *
 *   the neutral ramp sat at chroma 2.1 to 7.1, all at hue 90, which is yellow
 *   --brass-ink and --warning were 4 degrees apart on the wheel
 *   --brass-soft and --warning-soft were identical in chroma and hue
 *
 * So a gold accent, a gold warning and a gold page, none of which a contrast
 * test can object to. These three rules are about whether the palette is a
 * system rather than whether any given pair is legible.
 */
describe("the palette is a system, not a pile of legible pairs", () => {
  it("keeps the neutral ramp neutral", () => {
    /**
     * The load-bearing rule. A warm accent only reads as an accent against a
     * neutral field; on a warm field it is just more of the field. Chroma is
     * far less perceptible at low lightness, which is why the dark ramp gets a
     * slightly looser bound rather than a free pass: that is exactly how a
     * dark theme drifts coloured without anyone noticing.
     */
    const ramp = ["background", "surface", "surface-2", "border", "foreground", "primary", "ink"];
    for (const [block, limit, label] of [
      [lightBlock, 3.5, "light"],
      [darkBlock, 4.0, "dark"],
    ] as const) {
      for (const name of ramp) {
        const { c } = lch(token(block, name));
        expect(c, `${label} --${name} chroma ${c.toFixed(1)}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("keeps colours that mean different things looking different", () => {
    /**
     * Twenty degrees is not a lot; four is what shipped. The warm side of the
     * wheel genuinely cannot hold brass, amber and red all far apart, so this
     * is set at the achievable maximum rather than at a wish, and the third
     * separation is carried by role instead: brass never appears in the form a
     * status appears in, which the next rule checks.
     */
    for (const [block, label] of [
      [lightBlock, "light"],
      [darkBlock, "dark"],
    ] as const) {
      const meanings = ["brass", "success", "warning", "danger"] as const;
      for (let i = 0; i < meanings.length; i += 1) {
        for (let j = i + 1; j < meanings.length; j += 1) {
          const one = token(block, meanings[i]);
          const two = token(block, meanings[j]);
          const gap = hueGap(one, two);
          const lightnessGap = Math.abs(lch(one).l - lch(two).l);
          expect(
            gap >= 20 || lightnessGap >= 25,
            `${label} --${meanings[i]} and --${meanings[j]} are ${gap.toFixed(1)} deg and ${lightnessGap.toFixed(1)} L apart`
          ).toBe(true);
        }
      }
    }
  });

  it("spends the accent sparingly enough to still be an accent", () => {
    /**
     * The other half of why the last palette read as one colour: --info was
     * the brass, and --info is on 58 call sites across the AI surfaces. An
     * accent on 58 elements is the background.
     *
     * So the accent may not be the value of a token that carries whole
     * surfaces, and the count is bounded directly.
     */
    for (const block of [lightBlock, darkBlock]) {
      const brass = token(block, "brass");
      for (const name of ["info", "primary", "foreground", "background", "surface"]) {
        expect(token(block, name), `--${name} must not be the accent`).not.toBe(brass);
      }
    }
    const sources = sourceFiles("app")
      .concat(sourceFiles("components"))
      .filter((path) => path.endsWith(".tsx"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const brassUses = sources.match(/\b(?:bg|text|border|ring|from|to)-brass\b/g) ?? [];
    expect(
      brassUses.length,
      "brass is an accent, not a surface colour"
    ).toBeLessThanOrEqual(12);
  });
});

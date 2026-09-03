import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The theme blocks, and note which is which.
 *
 * `:root` is now the DARK theme. That is the reverse of what this file assumed
 * for most of its life, and it is deliberate: the app is a control system for
 * something that is running, so dark is the default and light is the choice.
 * The names below say `dark` and `light` rather than `root` and `override`
 * precisely so this cannot be misread the next time it changes.
 */
const globals = readFileSync("app/globals.css", "utf8");
const darkBlock = globals.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? "";
const lightBlock = globals.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";
const emailScope = globals.match(/\[data-surface="email"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";

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


const THEMES = [
  ["dark", darkBlock],
  ["light", lightBlock],
] as const;

describe("indigo and mint on a near-neutral ground", () => {
  it("keeps both themes at AA on every text and surface pair", () => {
    /**
     * The whole contrast suite, run over both themes rather than one, because
     * the previous version of this file checked light thoroughly and dark
     * partially, and dark is now what everyone sees by default.
     */
    for (const [name, block] of THEMES) {
      const grounds = ["background", "surface", "surface-2"].map((g) => token(block, g));
      for (const fg of ["foreground", "muted", "muted-2", "primary", "success", "warning", "danger", "info", "revenue"]) {
        for (const ground of grounds) {
          const ratio = contrast(token(block, fg), ground);
          expect(ratio, `${name} --${fg} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      // A label on a filled control.
      for (const [fill, label] of [
        ["primary", "primary-contrast"],
        ["success", "success-contrast"],
        ["warning", "warning-contrast"],
        ["danger", "danger-contrast"],
      ] as const) {
        expect(
          contrast(token(block, fill), token(block, label)),
          `${name} label on --${fill}`
        ).toBeGreaterThanOrEqual(4.5);
      }
      // Both ends of the identity gradient must carry the same contrast token.
      for (const end of ["brand-from", "brand-to"] as const) {
        expect(
          contrast(token(block, end), token(block, "brand-contrast")),
          `${name} --${end}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("separates the card from the page and gives the hairline an edge", () => {
    // A card at 1.06:1 against its page is the separation of two things that
    // are the same colour. The brief's own surface ladder measured 1.06 to 1.08
    // and was raised for exactly this reason.
    for (const [name, block] of THEMES) {
      const page = token(block, "background");
      const card = token(block, "surface");
      expect(contrast(card, page), `${name} card/page`).toBeGreaterThanOrEqual(1.10);
      expect(contrast(token(block, "surface-2"), card), `${name} inset/card`).toBeGreaterThanOrEqual(1.10);
      expect(contrast(token(block, "border"), card), `${name} border/card`).toBeGreaterThanOrEqual(1.30);
      expect(contrast(token(block, "border-firm"), card), `${name} firm/card`).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("keeps the neutral ramp neutral, so the accent has something to separate from", () => {
    /**
     * The load-bearing rule, and it has now caught two palettes.
     *
     * The gold system failed because its greys sat at hue 90 under a gold
     * accent. The obvious next mistake is a blue-grey ground under a blue
     * accent, and it measures: indigo reads 4.79:1 on a chroma-10 blue ground
     * against 5.01:1 on this one. Same error, smaller, avoided.
     */
    for (const [name, block] of THEMES) {
      for (const neutral of ["background", "surface", "surface-2", "foreground", "border", "border-firm"]) {
        const { c } = lch(token(block, neutral));
        expect(c, `${name} --${neutral} chroma ${c.toFixed(1)}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("keeps colours that mean different things looking different", () => {
    // 57.9 degrees at the tightest pair, against the 22.6 the gold system was
    // geometrically forced into. Indigo and mint have room gold never had.
    for (const [name, block] of THEMES) {
      const meanings = ["primary", "success", "warning", "danger"] as const;
      for (let i = 0; i < meanings.length; i += 1) {
        for (let j = i + 1; j < meanings.length; j += 1) {
          const gap = hueGap(token(block, meanings[i]), token(block, meanings[j]));
          expect(gap, `${name} --${meanings[i]} vs --${meanings[j]}`).toBeGreaterThanOrEqual(25);
        }
      }
    }
  });

  it("spends the accent sparingly enough for it to still be an accent", () => {
    /**
     * Half of why the gold palette read as one colour: --info was the accent,
     * and --info is on 58 call sites across the AI surfaces. An accent on 58
     * elements is the background. It is a neutral in both themes now.
     */
    for (const [name, block] of THEMES) {
      const accent = token(block, "primary");
      for (const surfaceToken of ["info", "foreground", "background", "surface", "revenue"]) {
        expect(token(block, surfaceToken), `${name} --${surfaceToken} must not be the accent`).not.toBe(accent);
      }
    }
  });

  it("keeps the two accents meaning one thing each", () => {
    for (const [name, block] of THEMES) {
      // Status must not be the action colour, or a success pill reads as a
      // brand element.
      expect(token(block, "success"), name).not.toBe(token(block, "primary"));
      // Money is its own signal, not an alias of "ok".
      expect(token(block, "revenue"), name).not.toBe(token(block, "success"));
    }
  });
});

describe("email surfaces do not follow the theme", () => {
  /**
   * The one place the theme deliberately does not reach. What is being edited
   * is an email; it will be read in Gmail, on white, by someone who has never
   * heard of this product's theme setting.
   */
  it("declares a light scope that wins over either theme", () => {
    expect(emailScope, "the scope must exist").not.toBe("");
    // Declared after both theme blocks, so it wins on order at equal specificity.
    // The RULE, not a mention of it: the selector is named in a comment inside
    // :root, and matching that would have made this pass by accident.
    expect(globals.indexOf('\n[data-surface="email"] {')).toBeGreaterThan(
      globals.indexOf('\n:root[data-theme="light"] {')
    );
    for (const t of ["background", "surface", "foreground", "border"]) {
      expect(emailScope, `--${t} must be redeclared`).toContain(`--${t}:`);
    }
    // Light, whatever the theme says.
    expect(contrast(token(emailScope, "foreground"), token(emailScope, "surface"))).toBeGreaterThanOrEqual(4.5);
    expect(luminance(token(emailScope, "surface"))).toBeGreaterThan(0.7);
    expect(emailScope).toContain("color-scheme: light");
  });

  it("is applied to the composer, and only where an email is actually rendered", () => {
    const editor = readFileSync("components/templates/TemplateEditor.tsx", "utf8");
    expect(editor, "the contentEditable composer needs the scope").toContain('data-surface="email"');
    // The reply thread viewer renders plain text, not email HTML. It is a
    // conversation reader and follows the theme like the rest of the chrome.
    const replies = readFileSync("components/replies/ReplyThreadViewer.tsx", "utf8");
    expect(replies).not.toContain('data-surface="email"');
  });

  it("keeps the preview iframes light, since their frame is themed even though their content is not", () => {
    // Both previews are <iframe sandbox=""> and inherit nothing from this
    // stylesheet, so their srcDoc is already light. The bug was the iframe
    // ELEMENT carrying a themed background, which shows through wherever the
    // email HTML paints none.
    for (const file of [
      "components/templates/TemplateEditor.tsx",
      "components/campaign/CampaignWizard.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      const iframe = source.slice(source.indexOf("<iframe"));
      expect(iframe.slice(0, 900), `${file} iframe frame must not be themed`).not.toMatch(
        /className="[^"]*bg-surface/
      );
      expect(source, `${file} srcDoc must paint a white body`).toContain("background:#fff");
    }
  });
});

describe("progress bars", () => {
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


});

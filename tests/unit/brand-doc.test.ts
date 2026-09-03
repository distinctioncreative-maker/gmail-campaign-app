import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = readFileSync("docs/brand.md", "utf8");
const css = readFileSync("app/globals.css", "utf8");

function darkToken(name: string): string {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  return root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? "";
}
function lightToken(name: string): string {
  const start = css.indexOf(':root[data-theme="light"] {');
  const block = css.slice(start, css.indexOf("\n}", start));
  return block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? "";
}

/**
 * The brand document has to agree with the code.
 *
 * It did not, and the gap was not a detail. It described radii of 3/5/8/10px
 * against an actual ladder of 6/10/14/20/28, stated flatly that "Elevation:
 * there is none" against a real four-level ladder, and documented a blue and
 * green palette three generations after that palette was replaced. Every axis
 * it covered was wrong.
 *
 * That is worse than having no document. Someone reading it in good faith would
 * have undone shipped decisions, and an agent reading it would have done so
 * confidently. So the parts that are checkable are checked, and the parts that
 * are judgement stay prose.
 */
describe("docs/brand.md agrees with the code", () => {
  it("quotes the radius ladder that actually ships", () => {
    for (const [name, expected] of [
      ["--radius-sm", "6px"],
      ["--radius-md", "10px"],
      ["--radius-lg", "14px"],
      ["--radius-2xl", "28px"],
    ] as const) {
      expect(darkToken(name.slice(2)), `${name} in globals.css`).toBe(expected);
      expect(doc, `${name} ${expected} in brand.md`).toContain(`${name}\` ${expected}`);
    }
  });

  it("does not repeat the claim that there is no elevation", () => {
    // The exact sentence that was false. Elevation exists and is four levels.
    expect(doc).not.toMatch(/Elevation.{0,20}there is none/i);
    for (const shadow of ["--shadow-sm", "--shadow-xl", "--edge-highlight"]) {
      expect(darkToken(shadow.slice(2)), `${shadow} must exist`).not.toBe("");
      expect(doc).toContain(shadow);
    }
    // And none of them may be `none`, which is what the doc used to claim.
    for (const shadow of ["shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
      expect(darkToken(shadow)).not.toBe("none");
    }
  });

  it("quotes the palette that actually ships, in both themes", () => {
    for (const name of ["background", "surface", "foreground", "primary", "success", "danger"]) {
      const dark = darkToken(name);
      const light = lightToken(name);
      expect(dark, `--${name} dark`).toMatch(/^#[0-9a-f]{6}$/);
      expect(light, `--${name} light`).toMatch(/^#[0-9a-f]{6}$/);
      expect(doc, `--${name} dark value ${dark}`).toContain(dark);
      expect(doc, `--${name} light value ${light}`).toContain(light);
    }
  });

  it("carries no value from a retired palette", () => {
    // Blue, then green, then gold. Each was documented after it stopped being
    // true, which is how the doc ended up three palettes behind.
    for (const retired of [
      "#2354c7", "#0b0f17", "#0f1729", "#e8edf5", "#6e9bff", // blue
      "#1c4d3c", "#6fbf9a", "#f6f4ef", // green
      "#b08d4f", "#7a5d23", "#d9bd85", "#111114", // gold
    ]) {
      expect(doc.toLowerCase(), `retired value ${retired}`).not.toContain(retired);
    }
  });

  it("says dark is the default, because it is", () => {
    expect(doc).toMatch(/\*\*Dark is the default\.\*\*/);
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("t==='light'?'light':'dark'");
  });
});

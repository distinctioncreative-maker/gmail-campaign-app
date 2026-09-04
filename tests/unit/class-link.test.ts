import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globals = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path)) out.push(path);
  }
  return out;
}

const components = [...walk("app"), ...walk("components")];

/** Every `.foo` this stylesheet actually defines. */
const defined = new Set(
  [...globals.matchAll(/\.([a-z][\w-]*)/g)].map(([, name]) => name)
);

/**
 * The families of class name this app writes itself, as opposed to the ones
 * Tailwind generates. A token in one of these families has to exist in
 * globals.css, because nothing else will ever produce it.
 */
const OWN_FAMILIES = [
  /^btn(-|$)/,
  /^card(-|$)/,
  /^badge(-|$)/,
  /^alert-/,
  /^segmented(-|$)/,
  /^editor-/,
  /^page-/,
  /^section-/,
  /^cadence-/,
  /^popover-/,
  /^tooltip-/,
  /^status-dot-/,
  /^jarvis-/,
  /^onboarding-/,
  /^tour-/,
  /^live-/,
  /^draw-/,
  /^grow-/,
  /^reel-/,
  /^drift-/,
  /^pulse-/,
  /^route-/,
  /^stagger(-|$)/,
  /^animate-/,
  /^glass$/,
  /^link$/,
  /^shimmer$/,
  /^meter(-|$)/,
];

/**
 * A link step for class names.
 *
 * CSS has none: an undefined class in a `className` is not an error anywhere in
 * this toolchain. It compiles, it renders, it just silently does nothing. Two
 * of these shipped in this redesign already. `--color-brass-on-ink` pointed at
 * a deleted variable, which tests/unit/token-exports.test.ts now catches. This
 * is the other half: `live-dot` was applied in four places and defined nowhere,
 * and LiveRefresh actually branched on it (`pulse ? "" : "live-dot"`), so the
 * branch meant to animate rendered a completely static dot.
 *
 * The rule is limited to the class families this app writes itself, because
 * Tailwind's generated utilities cannot be checked against a stylesheet that
 * does not contain them. That is the honest boundary: within it, a name that
 * resolves to nothing fails here.
 */
describe("every class this app writes itself is defined", () => {
  const used = new Map<string, string[]>();
  for (const path of components) {
    const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, value] of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const token of (value ?? "").split(/[\s${}?:()]+/)) {
        const name = token.trim();
        // `animate-[rise_0.2s_ease]` and friends are Tailwind arbitrary values:
        // Tailwind generates the rule, so this stylesheet will never contain it.
        if (name.includes("[")) continue;
        if (!name || !OWN_FAMILIES.some((f) => f.test(name))) continue;
        used.set(name, [...(used.get(name) ?? []), path]);
      }
    }
  }

  it("finds a real number of them, so the rule is not passing on an empty set", () => {
    expect(used.size).toBeGreaterThan(15);
    // And the stylesheet it checks against is actually being read.
    expect(defined.has("card")).toBe(true);
    expect(defined.has("btn-primary")).toBe(true);
  });

  it("has none whose every declaration switches it off", () => {
    /**
     * The third shape of the same bug, and the one the two rules either side
     * of this miss.
     *
     * `--color-brass-on-ink` pointed at a deleted token; the token link step
     * catches that. `live-dot` was applied and never defined; the rule below
     * catches that. `.pulse-sheen` was defined as `display: none` and its
     * element was still rendered in the chart, with a keyframe written for it
     * and a reduced-motion opt-out protecting an animation that could never
     * run. Everything resolved. Nothing rendered.
     *
     * A class whose only substantive declaration is `display: none` is either
     * a deletion someone did not finish or markup that should not be there.
     * Both are worth a failing test, because neither is visible any other way.
     */
    const disabled = [...used.keys()].filter((name) => {
      const rules = [...globals.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) =>
        new RegExp(`(^|,)\\s*\\.${name}\\s*(,|:|\\s|$)`).test(selector)
      );
      if (rules.length === 0) return false;
      return rules.every(([, , body]) => /display:\s*none/.test(body));
    });
    expect(disabled).toEqual([]);
  });

  it("has none that resolve to nothing", () => {
    const dangling = [...used.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, paths]) => `${name} (${[...new Set(paths)].join(", ")})`)
      .sort();
    expect(dangling).toEqual([]);
  });
});

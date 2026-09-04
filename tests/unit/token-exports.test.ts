import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

/** CSS with comments stripped, because these rules are about what resolves. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(path)) out.push(path);
  }
  return out;
}

const bare = code(css);

/** Every `--foo: value` declared anywhere in the file. */
const declared = new Set([...bare.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

/**
 * Font variables are declared by next/font, which injects them onto <html> at
 * runtime rather than writing them into this stylesheet. They are read from the
 * layout rather than listed here on purpose: an exemption written as a literal
 * would keep passing after the font it names is deleted, which is the same
 * class of bug this file exists to catch.
 */
const layout = readFileSync("app/layout.tsx", "utf8");
const fontVariables = [...layout.matchAll(/variable:\s*"(--[\w-]+)"/g)].map((m) => m[1]);
expectFontsDeclared(fontVariables);
for (const name of fontVariables) declared.add(name);

function expectFontsDeclared(names: string[]) {
  // Non-vacuity: if next/font stops declaring variables, the exemption must
  // collapse rather than silently widen to nothing.
  if (names.length < 2) throw new Error("app/layout.tsx declares no font variables");
}

/** The `@theme inline` block, which is the only way tokens become utilities. */
const themeBlock = (() => {
  const start = bare.indexOf("@theme inline");
  expect(start, "@theme inline must exist").toBeGreaterThan(-1);
  let depth = 0;
  for (let i = bare.indexOf("{", start); i < bare.length; i++) {
    if (bare[i] === "{") depth++;
    else if (bare[i] === "}" && --depth === 0) return bare.slice(start, i);
  }
  throw new Error("unterminated @theme inline");
})();

/**
 * An export pointing at a variable that does not exist.
 *
 * Tailwind emits the utility either way. `--color-brass-on-ink: var(--brass-on-ink)`
 * survived the deletion of the brass palette and shipped as
 * `.text-brass-on-ink { color: var(--brass-on-ink) }` with nothing on the other
 * end, so the one element using it silently inherited its parent's colour
 * instead of failing loudly. Nothing in the build, the typechecker, the linter
 * or the existing palette guards had any opinion about it: CSS custom
 * properties have no link step.
 *
 * This is that link step. It is cheap because both halves are in one file, and
 * it is worth having because the failure it catches is invisible — the page
 * still renders, just in the wrong colour.
 */
describe("every exported token resolves to a declared one", () => {
  const exports = [...themeBlock.matchAll(/^\s*(--[\w-]+)\s*:\s*var\((--[\w-]+)\)/gm)].map(
    ([, name, target]) => ({ name, target })
  );

  it("exports a real number of tokens, so the rule is not passing on an empty set", () => {
    expect(exports.length).toBeGreaterThan(40);
  });

  it("has no export pointing at a variable nobody declares", () => {
    const dangling = exports.filter((e) => !declared.has(e.target));
    expect(dangling).toEqual([]);
  });
});

/**
 * The stacking order.
 *
 * Seven z-indexes were in use across the app — 10, 30, 40, 50, 60, 70 and 100 —
 * none of them named and none written down, so each new overlay picked its
 * number by looking at whatever was nearby and adding. That works until two
 * things that must never overlap get chosen independently and land on the same
 * rung, and by then the fix is to re-derive the whole order from the rendering.
 */
describe("the stacking order is named, ordered, and the only one in use", () => {
  const rungs = ["raised", "chrome", "popover", "overlay", "modal", "toast", "skip"];

  it("declares and exports every rung", () => {
    for (const rung of rungs) {
      expect(declared.has(`--z-${rung}`), `--z-${rung} must be declared`).toBe(true);
      expect(themeBlock).toMatch(new RegExp(`--z-index-${rung}:\\s*var\\(--z-${rung}\\)`));
    }
  });

  it("puts them in an order that matches what each rung is for", () => {
    const value = (rung: string) =>
      Number(new RegExp(`--z-${rung}:\\s*(\\d+)`).exec(bare)?.[1]);
    const values = rungs.map(value);
    expect(values.some(Number.isNaN)).toBe(false);
    // Strictly ascending: two rungs sharing a number is the exact failure the
    // ladder exists to prevent.
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(new Set(values).size).toBe(values.length);
    // A toast above a dialog, deliberately: a toast a dialog covers is a
    // message nobody reads.
    expect(value("toast")).toBeGreaterThan(value("modal"));
  });

  it("leaves no component picking a number by hand", () => {
    const offenders: string[] = [];
    for (const path of [...walk("app"), ...walk("components")]) {
      const source = path.endsWith(".css")
        ? code(readFileSync(path, "utf8"))
        : readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const hits = source.match(/(?:^|\s)z-\[?\d+\]?(?:\s|"|'|`)/g);
      if (hits) offenders.push(`${path}: ${hits.map((h) => h.trim()).join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Reduced motion is opted into, one class at a time.
 *
 * There is no blanket `* { animation: none }` rule in this file, and there
 * should not be: several of these animations carry meaning that a hard stop
 * would remove rather than calm. The cost of that choice is that every new
 * animation has to remember to add itself, and four had not: the status dot's
 * flash, and the three entrance animations on the dialog, the popover
 * and the tooltip.
 *
 * An infinite loop is the exact thing this preference exists to spare someone,
 * so the omission is not cosmetic. This is the reminder, written as a rule
 * rather than as a habit.
 */
describe("every animation can be turned off", () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  const reducedMotionSpans: Array<[number, number]> = [];
  for (const match of withoutComments.matchAll(
    /@media \(prefers-reduced-motion: reduce\)\s*\{/g
  )) {
    let i = match.index! + match[0].length;
    let depth = 1;
    while (depth > 0 && i < withoutComments.length) {
      if (withoutComments[i] === "{") depth++;
      else if (withoutComments[i] === "}") depth--;
      i++;
    }
    reducedMotionSpans.push([match.index!, i]);
  }

  const insideReducedMotion = reducedMotionSpans
    .map(([a, b]) => withoutComments.slice(a, b))
    .join("");
  let outside = withoutComments;
  for (const [a, b] of [...reducedMotionSpans].reverse()) {
    outside = outside.slice(0, a) + outside.slice(b);
  }

  const animated = new Set<string>();
  for (const rule of outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    if (!/\banimation(-name)?\s*:/.test(body)) continue;
    if (/\banimation\s*:\s*none/.test(body)) continue;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) animated.add(name);
  }
  const covered = new Set(
    [...insideReducedMotion.matchAll(/\.([\w-]+)/g)].map(([, name]) => name)
  );

  it("finds the animations, so the rule is not passing on an empty set", () => {
    expect(reducedMotionSpans.length).toBeGreaterThan(4);
    expect(animated.size).toBeGreaterThan(15);
  });

  it("has a reduced-motion opt-out for every animated class", () => {
    expect([...animated].filter((name) => !covered.has(name)).sort()).toEqual([]);
  });

  it("still stops the one that reports a change", () => {
    // Non-vacuity for the rule above: a reduced-motion block that named every
    // class but set nothing would pass it. Checked by finding the rule this
    // class is actually in rather than by proximity, because a nearby rule's
    // `animation: none` will satisfy a regex window and prove nothing.
    const rule = [...insideReducedMotion.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      ([, selector]) => /(^|,)\s*\.status-dot-flash\s*(,|$)/.test(selector.trim())
    );
    expect(rule, ".status-dot-flash must be in a reduced-motion rule").toBeTruthy();
    expect(rule![2]).toMatch(/animation:\s*none/);
  });
});

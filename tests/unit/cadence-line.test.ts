import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync("components/ui/CadenceLine.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

/**
 * The product's one visual signature.
 *
 * Before this existed, nothing on screen identified Cadence except the
 * wordmark, which is the difference between a brand and a logo. The motif is
 * several trajectories running through a system, and the point is that it is
 * geometry rather than an illustration: the same lines are a separator, a
 * loading state, a progress bar and a campaign diagram.
 *
 * These rules exist because a motif only works if it stays one motif. The
 * failure mode is not that it looks wrong, it is that six screens each draw
 * their own parallel lines slightly differently and the signature dissolves.
 */
describe("the Cadence Line is one motif, not a style", () => {
  it("defines its geometry once and shares it across every variant", () => {
    // A single PATHS constant. If a variant starts drawing its own `d`
    // attribute the shape stops being recognisable between contexts.
    expect(component).toContain("const PATHS =");
    const inlinePaths = component.match(/d="M[^"]+"/g) ?? [];
    expect(inlinePaths, "no variant may hand-draw its own geometry").toEqual([]);
  });

  it("keeps the two accents meaning what they mean everywhere else", () => {
    // Indigo is what we sent, mint is what came back. The motif is not allowed
    // to introduce a colour, which is how a signature turns into decoration.
    expect(component).toContain("var(--success)");
    expect(component).toContain("var(--primary)");
    expect(component).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("moves only where movement means something", () => {
    /**
     * `loading` animates because a loading state is a claim that work is
     * happening. A separator or a diagram animating on a loop would be motion
     * in peripheral vision carrying no information, which is the one thing the
     * motion philosophy here rules out.
     */
    const animated = css.match(/\.cadence-[\w-]+\s*\{[^}]*animation:[^}]*\}/g) ?? [];
    expect(animated.length, "something must animate, or this rule is vacuous").toBeGreaterThan(0);
    for (const rule of animated) {
      expect(rule, "only the loading variant may animate").toMatch(/\.cadence-loading/);
    }
  });

  it("stops under reduced motion", () => {
    const reduced = css.slice(css.indexOf(".cadence-separator"));
    const block = reduced.slice(reduced.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block.slice(0, 400)).toContain(".cadence-loading-path { animation: none;");
  });

  it("stays a server component with no animation dependency", () => {
    expect(component).not.toContain('"use client"');
    expect(component).not.toMatch(/useState|useEffect|useRef/);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ["framer-motion", "motion", "gsap", "lottie-react"]) {
      expect(deps[banned], `${banned} must not be a dependency`).toBeUndefined();
    }
  });

  it("is the only thing drawing this geometry", () => {
    // The whole point. If another component starts drawing parallel branching
    // lines by hand, there are two motifs and therefore none.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.tsx$/.test(entry.name) ? [path] : [];
      });
    const others = [...walk("app"), ...walk("components")].filter(
      (path) => !path.endsWith("ui/CadenceLine.tsx")
    );
    const offenders = others.filter((path) => {
      const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // Two or more hand-written horizontal path commands in one file is
      // somebody rebuilding this by hand.
      return (source.match(/d="M0 \d+ H/g) ?? []).length >= 2;
    });
    expect(offenders).toEqual([]);
  });
});

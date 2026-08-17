import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const meter = readFileSync("components/ui/charts/Meter.tsx", "utf8");

/**
 * Every .tsx under components/ and app/, so the assertions below are about the
 * whole product rather than the files that happened to get converted.
 */
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function sourceFiles(): Array<[string, string]> {
  // Recursive readdir rather than globSync, which is not in this project's
  // @types/node. Mirrors the helper in copy-style.test.ts.
  return [...walk("components"), ...walk("app")].map((path) => [
    path,
    readFileSync(path, "utf8"),
  ]);
}

describe("the proportion meter", () => {
  it("derives its track from its fill so the two can never collide", () => {
    /**
     * There were nineteen hand-rolled proportion bars across twelve files, each
     * picking its own track and fill. One of them shipped as bg-surface-2 on
     * bg-surface-2, which is 1.00:1 and therefore an invisible bar that still
     * looked like working code.
     *
     * Deriving the track from the fill with color-mix makes that class of bug
     * unreachable rather than merely fixed: there is no longer a second colour
     * to choose wrongly.
     */
    expect(meter).toContain("color-mix(in srgb, ${fill} 16%, var(--surface-2))");
    // The fill must come from the tone table, not from a caller-supplied class.
    expect(meter).toMatch(/const FILL: Record<MeterTone, string>/);
  });

  it("clamps out-of-range values instead of overflowing its track", () => {
    expect(meter).toContain("Math.max(0, Math.min(100,");
    // A zero or negative max would divide by zero and render NaN% as a width.
    expect(meter).toContain("max > 0 ? max : 1");
  });

  it("carries state in the fill, not only in the number beside it", () => {
    // A bar that is always the accent colour makes the reader parse a
    // percentage to discover whether it is good news.
    for (const tone of ["progress", "good", "warning", "danger"]) {
      expect(meter).toContain(`${tone}:`);
    }
  });

  it("is hidden from assistive tech unless it is the only label", () => {
    // The caller almost always prints the figure next to the bar, which is both
    // the accessible text and the precise value. Announcing both is noise.
    expect(meter).toContain('"aria-hidden": true');
    expect(meter).toContain('role: "progressbar"');
  });

  it("has displaced the hand-rolled bars rather than joining them", () => {
    /**
     * The point of a primitive is that the copies go away. This counts the
     * remaining track-and-fill pairs: a bar is only the pattern this replaces if
     * it also sets an inline width percentage, which is what separates a real
     * meter from the decorative circles and numbered badges that happen to share
     * the same utility class.
     */
    const suspects: string[] = [];
    for (const [path, source] of sourceFiles()) {
      if (path.includes("charts/Meter")) continue;
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!/rounded-full bg-surface-2/.test(line)) return;
        // Look at the next few lines for an inline width percentage.
        const window = lines.slice(index, index + 6).join(" ");
        if (/width: `\$\{/.test(window)) suspects.push(`${path}:${index + 1}`);
      });
    }
    // Two remain and both are deliberate: the campaign wizard's step indicator,
    // which is chrome rather than a measurement, and a demo page, which is an
    // illustrative surface rather than one reporting real workspace numbers.
    // The bound is tight against that count, so a new hand-rolled bar on a real
    // screen fails here.
    expect(suspects.length, `remaining hand-rolled meters:\n${suspects.join("\n")}`).toBeLessThanOrEqual(2);
  });
});

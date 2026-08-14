import { describe, expect, it } from "vitest";
import { linePath, niceTicks, scale, compact } from "@/components/ui/charts/geometry";

/**
 * Samples a cubic bezier segment so the curve can be checked against the data it
 * claims to represent. The path is the thing shipped to a browser, so the test
 * reads the path rather than the tangent maths that produced it.
 */
function sampleCubic(p0: number, c1: number, c2: number, p1: number, steps = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1);
  }
  return out;
}

/** Every y value the rendered curve actually passes through. */
function curveYValues(path: string): number[] {
  const start = path.match(/^M ([-\d.]+) ([-\d.]+)/);
  if (!start) return [];
  let cursorY = Number(start[2]);
  const ys: number[] = [cursorY];
  const segments = path.matchAll(/C ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)/g);
  for (const segment of segments) {
    const c1y = Number(segment[2]);
    const c2y = Number(segment[4]);
    const endY = Number(segment[6]);
    ys.push(...sampleCubic(cursorY, c1y, c2y, endY));
    cursorY = endY;
  }
  return ys;
}

describe("chart geometry", () => {
  describe("smoothing never invents values the data does not contain", () => {
    /**
     * This is the whole reason the interpolation is monotone cubic rather than
     * the Catmull-Rom every charting tutorial reaches for. The failures are not
     * hypothetical; these are measured against a standard cardinal spline on the
     * exact series below:
     *
     *   [10, 10, 40, 60]  data floor 10  → curve reaches  7.78
     *   [20, 20, 20, 80]  data floor 20  → curve reaches 15.56
     *   [4, 4, 90, 4, 4]  data floor  4  → curve reaches -2.37
     *
     * That last one draws a negative number on a series that never goes below
     * four. On a reply-rate chart it is a negative percentage; on a volume chart
     * it is a quantity of email nobody sent. The curve is sampled from the
     * rendered path here rather than trusted, because the path is what ships.
     */
    it("does not dip below the floor on a flat-then-rise series", () => {
      const values = [10, 10, 40, 60];
      const path = linePath(values.map((y, x) => ({ x: x * 100, y })));
      const ys = curveYValues(path);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 1e-6);
    });

    it("does not overshoot above the ceiling on a rise-then-flat series", () => {
      const values = [60, 40, 10, 10];
      const path = linePath(values.map((y, x) => ({ x: x * 100, y })));
      const ys = curveYValues(path);
      expect(Math.max(...ys)).toBeLessThanOrEqual(60 + 1e-6);
    });

    it("stays inside the data range on a spike", () => {
      // The shape that breaks naive smoothing worst: a single tall spike.
      const values = [4, 4, 90, 4, 4];
      const path = linePath(values.map((y, x) => ({ x: x * 100, y })));
      const ys = curveYValues(path);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(90 + 1e-6);
    });

    it("keeps a flat run genuinely flat", () => {
      const path = linePath([0, 1, 2, 3].map((x) => ({ x: x * 100, y: 25 })));
      const ys = curveYValues(path);
      for (const y of ys) expect(y).toBeCloseTo(25, 6);
    });

    it("draws a plain segment for two points and nothing for none", () => {
      expect(linePath([{ x: 0, y: 1 }, { x: 10, y: 5 }])).toBe("M 0 1 L 10 5");
      expect(linePath([])).toBe("");
    });
  });

  describe("axis ticks", () => {
    it("rounds to numbers a person would choose", () => {
      expect(niceTicks(0, 1000, 3)).toEqual([0, 500, 1000]);
      expect(niceTicks(0, 10, 3)).toEqual([0, 5, 10]);
    });

    it("never returns a single-value axis for a real range", () => {
      expect(niceTicks(0, 7, 3).length).toBeGreaterThan(1);
    });

    it("survives a flat series without dividing by zero", () => {
      expect(niceTicks(5, 5)).toEqual([5]);
      expect(scale(5, 5, 5, 0, 100)).toBe(50);
    });
  });

  describe("compact figures", () => {
    it("only abbreviates once abbreviating helps", () => {
      // 1,284 is more informative than 1.3K and just as short.
      expect(compact(1284)).toBe("1,284");
      expect(compact(12900)).toBe("12.9K");
      expect(compact(4_200_000)).toBe("4.2M");
    });

    it("drops a trailing zero rather than printing 12.0K", () => {
      expect(compact(12000)).toBe("12K");
    });
  });
});

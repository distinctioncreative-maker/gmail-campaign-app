import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
/** Source with comments stripped, because these rules are about what renders. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path)) out.push(path);
  }
  return out;
}

const sources = [...walk("app"), ...walk("components")];

/**
 * A meter's colour has to mean what the number means.
 *
 * `Meter` documents this itself: "Blue: work happening. Green: work finished, or
 * a number where up is good." Every caller ignored it. Send progress, wizard
 * steps, onboarding completion and the setup checklist all passed `tone="good"`,
 * so a campaign 42% through its list drew a mint bar directly beside an amber
 * "Paused" badge: the colour said healthy, the badge said stopped, and the
 * colour is the one you read first. Meanwhile the reply rate, the single number
 * on the page mint actually means, was drawing in indigo.
 *
 * Mint carries one meaning in this product and its value comes entirely from
 * being scarce. A bar that is mint whatever the number says is decoration.
 */
describe("meters are coloured by what they measure", () => {
  const usages = sources.flatMap((path) => {
    const source = code(read(path));
    return [...source.matchAll(/<Meter\b([^>]*)>/g)].map(([, props]) => ({
      path,
      props: props.replace(/\s+/g, " ").trim(),
    }));
  });

  it("finds the meters, so this is not passing on an empty set", () => {
    expect(usages.length).toBeGreaterThan(6);
  });

  it("never paints progress as an outcome", () => {
    // Progress is how far through something you are. It is not a result, and it
    // is certainly not a reply.
    const PROGRESS = /progressRate|step|steps\.length|completeness|done\b/;
    const offenders = usages
      .filter((u) => PROGRESS.test(u.props) && /tone="good"/.test(u.props))
      .map((u) => `${u.path}: ${u.props.slice(0, 70)}`);
    expect(offenders).toEqual([]);
  });

  it("paints a reply rate as the one thing mint means", () => {
    // Non-vacuity for the rule above: removing every tone would satisfy it.
    const replyMeters = usages.filter((u) => /replyRate/.test(u.props));
    expect(replyMeters.length).toBeGreaterThan(0);
    for (const m of replyMeters) {
      expect(m.props, `${m.path} draws a reply rate`).toMatch(/tone="good"/);
    }
  });

  it("leaves nobody drawing their own proportion bar", () => {
    /**
     * Nineteen hand-rolled bars were the reason Meter exists. The campaign
     * wizard still had one, in mint, and it is how the tone drifted in the
     * first place: a bar nothing owns has no rule to break.
     */
    const handRolled = sources.filter((path) => {
      const source = code(read(path));
      return /rounded-full bg-(success|primary|warning|danger)[^"]*"\s*\n?\s*style=\{\{\s*width:/.test(
        source
      );
    });
    expect(handRolled).toEqual([]);
  });
});

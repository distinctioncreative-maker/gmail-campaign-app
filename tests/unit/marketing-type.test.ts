import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** CSS with comments stripped, because these rules are about what renders. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

function moduleStylesheets(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) moduleStylesheets(path, out);
    else if (path.endsWith(".module.css")) out.push(path);
  }
  return out;
}

const sheets = moduleStylesheets("components");
const landing = code(readFileSync("components/marketing/landing.module.css", "utf8"));

/**
 * Four weights, because four is how many a reader can tell apart.
 *
 * This stylesheet used fourteen: 450, 500, 550, 600, 620, 640, 650, 660, 680,
 * 700, 720, 730, 740 and 780. Inter is a variable font, so every one of them
 * rendered — and seven of them lived between 660 and 780, a span narrower than
 * the eye resolves. Nobody can see 730 against 740. What that produces is not
 * subtlety, it is fourteen decisions that look like carelessness, because an
 * eyebrow, a button and a heading each landed on a different arbitrary number
 * with no rule connecting them.
 *
 * The four that survive have jobs: 400 body, 500 emphasis inside body copy,
 * 600 everything structural, 700 the hero and only the hero.
 */
describe("the marketing type has four weights", () => {
  const ALLOWED = new Set(["400", "500", "600", "700"]);

  it("checks a real stylesheet, so this is not passing on an empty set", () => {
    expect(sheets.length).toBeGreaterThan(0);
    expect(landing.length).toBeGreaterThan(20_000);
  });

  it("uses no others, in any module stylesheet", () => {
    const offenders: string[] = [];
    for (const path of sheets) {
      for (const [, weight] of code(readFileSync(path, "utf8")).matchAll(
        /font-weight:\s*(\d+)/g
      )) {
        if (!ALLOWED.has(weight)) offenders.push(`${path}: ${weight}`);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it("spends 700 on the headline and nothing else", () => {
    // A weight reserved for one thing stops being a weight and becomes a
    // signal. Spending it twice is how the ladder starts sliding back.
    const sevens = [...landing.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) =>
      /font-weight:\s*700/.test(body)
    );
    expect(sevens.length).toBe(1);
    expect(sevens[0][1]).toContain(".hero h1");
  });

  it("gives the bare <b> in the mocks a weight of its own", () => {
    /**
     * `font-weight: bolder` is the UA default for <b>, and it is relative: in a
     * container set to 500, Chrome resolves it to 900. So an unread count in a
     * decorative Gmail mock rendered heavier than the page's own headline.
     * Preflight does not reach these elements, because this page is CSS
     * modules rather than utilities.
     */
    expect(landing).toMatch(/\.mailRail b[\s\S]{0,80}font-weight: 600/);
  });
});

/**
 * The headline breaks at its beats.
 *
 * It is three sentences and the middle one carries the accent. Written as three
 * sentences separated by spaces under `text-wrap: balance`, the browser
 * balanced line LENGTHS across all three and broke wherever the arithmetic
 * landed: "person." was orphaned onto the third line beside "Get replies.", so
 * the accent colour started mid-line and the middle beat was split across two.
 * Three blocks break at the beat at every width, and balance then does the job
 * it is good at, inside each one.
 */
describe("the hero headline", () => {
  const markup = readFileSync("components/marketing/sections/Hero.tsx", "utf8");

  it("renders each beat as its own block", () => {
    expect(landing).toMatch(/\.beat \{[^}]*display: block/);
    const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? "";
    expect(h1).toBeTruthy();
    expect([...h1.matchAll(/className=\{styles\.beat\}/g)].length).toBe(3);
  });

  it("uses beats for every multi-sentence heading, not just the hero", () => {
    /**
     * The hero was fixed first and the outcome band had the identical defect:
     * "More replies. More meetings. More closed deals." broke as "More replies.
     * More / meetings. More / closed deals.", orphaning the word "More" onto
     * the end of two lines running. Fixing one instance of a rule and leaving
     * the other is how a rule becomes a special case.
     */
    const bands = readdirSync("components/marketing/sections")
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => [f, readFileSync(`components/marketing/sections/${f}`, "utf8")] as const);

    const offenders: string[] = [];
    for (const [file, source] of bands) {
      // [, , inner] and not [, inner]: group 1 is the heading digit, group 2
      // is the content. Getting that wrong makes this rule inspect the string
      // "2", which has no sentences in it and therefore never fails.
      for (const [, , inner] of source.matchAll(/<h([12])>([\s\S]*?)<\/h\1>/g)) {
        if (/className=\{styles\.beat\}/.test(inner)) continue;
        const text = inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        // Two or more sentences in one heading and no beats.
        if ((text.match(/[.!?](\s|$)/g) ?? []).length >= 2) offenders.push(`${file}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the accent on exactly one whole beat", () => {
    const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? "";
    const ems = [...h1.matchAll(/<em>([\s\S]*?)<\/em>/g)].map(([, t]) => t.trim());
    expect(ems.length).toBe(1);
    // The accent wraps a complete sentence, not a fragment of one.
    expect(ems[0]).toMatch(/^[A-Z][^.]*\.$/);
  });
});

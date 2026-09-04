import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The landing page's markup, wherever it lives.
 *
 * This used to be one 876-line file. It is now a shell plus nine band files
 * plus a shared module, so a rule that reads only Landing.tsx would pass by
 * looking at a file that no longer contains the thing it is checking. The
 * rules did not change; where the markup lives did, so this follows it.
 */
const marketingSources = () => {
  const paths = [
    "components/marketing/Landing.tsx",
    "components/marketing/shared.tsx",
    ...readdirSync("components/marketing/sections")
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `components/marketing/sections/${f}`),
  ];
  // Non-vacuity: if the split is ever undone or renamed, this stops silently
  // reading a smaller page than the one that ships.
  if (paths.length < 10) throw new Error("marketing sources missing");
  return paths;
};

const landingSource = marketingSources()
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const landingStyles = readFileSync(
  "components/marketing/landing.module.css",
  "utf8"
);
const globalStyles = readFileSync("app/globals.css", "utf8");

/**
 * The landing stylesheet with comments removed.
 *
 * Three separate assertions in this file scan the stylesheet for patterns that
 * are banned in declarations, and all three matched prose inside comments
 * instead: a comment naming the hex a token used to resolve to, and a comment
 * quoting the `box-shadow: none` it was replacing, each broke a different check.
 * Every rule here is about what the CSS *does*, so they all read this. A fix has
 * to be able to explain itself in the file it fixes.
 */
const landingDeclarations = landingStyles.replace(/\/\*[\s\S]*?\*\//g, "");

function tokenHex(name: string): string {
  const value = globalStyles.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`)
  )?.[1];
  if (!value) throw new Error(`Missing six-digit token --${name}`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(first: string, second: string, firstWeight: number): string {
  const firstChannels = first.replace("#", "").match(/.{2}/g)?.map((value) => Number.parseInt(value, 16));
  const secondChannels = second.replace("#", "").match(/.{2}/g)?.map((value) => Number.parseInt(value, 16));
  if (!firstChannels || !secondChannels) throw new Error("Expected six-digit hex colors");
  return `#${firstChannels.map((value, index) =>
    Math.round(value * firstWeight + secondChannels[index] * (1 - firstWeight))
      .toString(16)
      .padStart(2, "0")
  ).join("")}`;
}

describe("the public palette cannot be moved by the app's theme", () => {
  /**
   * The bug this exists to prevent, stated once.
   *
   * globals.css keeps a --marketing-* ramp specifically so the public page can
   * stay light while the authenticated app switches themes, and the landing
   * stylesheet is supposed to resolve everything through it. Four of its tokens
   * instead read --success, --success-soft, --revenue and --revenue-soft
   * directly, and a fifth read --danger. All five are remapped under
   * [data-theme="dark"], and the root layout defaults an unrecognised visitor to
   * dark. So the marketing page served dark-mode status colours inside
   * light-mode sections: --success-soft resolved to #10261d, a near-black green,
   * and it is a background in eight rules, one of which put #0f1729 body copy on
   * it at 1.12:1.
   *
   * Asserting those five names would only stop it recurring in those five
   * places. This is written against the rule instead, so a sixth token added
   * next year fails the same way.
   */
  /**
   * The theme-dependent block. This is now the LIGHT one, because :root became
   * the dark theme when the app went dark-first. The rule is unchanged and so
   * is its point: these are the tokens that MOVE when the visitor's app theme
   * moves, and the public page must never resolve through any of them. Only the
   * selector moved, and it is worth noting that this test caught the flip
   * rather than silently passing against an empty set, which is what the
   * non-vacuity floor below is for.
   */
  const darkBlock = (() => {
    const start = globalStyles.indexOf(':root[data-theme="light"] {');
    return globalStyles.slice(start, globalStyles.indexOf("\n}", start));
  })();

  /** Every custom property globals.css redefines for dark mode. */
  const themeDependent = new Set(
    [...darkBlock.matchAll(/^\s*--([\w-]+):/gm)].map((match) => match[1])
  );

  it("remaps a meaningful number of tokens for dark mode", () => {
    // Guards the guard. If this set came back empty the assertion below would
    // pass against anything, which is how a test like that quietly rots.
    expect(themeDependent.size).toBeGreaterThan(20);
    expect(themeDependent.has("success-soft")).toBe(true);
  });

  it("never reads a theme-remapped token anywhere in the landing stylesheet", () => {
    /**
     * Tightened from "every --landing-* declaration" to "every var() reference
     * in the file". The narrower version would have missed a rule that reads a
     * theme token directly in a property rather than through the token block,
     * which became a live possibility once the dark outcome band started
     * overriding chart variables locally. Verified against the file at the time
     * of tightening: zero references, so this costs nothing today and closes the
     * gap for tomorrow.
     */
    const declarations = [
      ...landingStyles.matchAll(/^\s*(--landing-[\w-]+):\s*([^;]+);/gm),
    ];
    expect(declarations.length).toBeGreaterThan(30);

    // --landing-* and --marketing-* are invariant by construction; --radius-*,
    // --ease-* and --dur-* are not colours and are never remapped.
    const referenced = [...landingDeclarations.matchAll(/var\(\s*--([\w-]+)/g)].map(
      (match) => match[1]
    );
    const leaks = [...new Set(referenced.filter((name) => themeDependent.has(name)))];
    expect(leaks).toEqual([]);
  });

  it("gives the dark band chart colours that do not follow the app theme", () => {
    // The band is always dark, whatever theme the visitor's app is in, so a
    // chart mark taken from --chart-* would be wrong for half of them. These are
    // separate invariant tokens, validated against this band's own ink ground
    // rather than a generic dark surface.
    expect(globalStyles).toContain("--marketing-chart-on-ink-1");
    expect(globalStyles).toContain("--marketing-chart-on-ink-2");
    expect(landingStyles).toMatch(
      /\.outcomeBand \{[\s\S]*?--chart-1: var\(--marketing-chart-on-ink-1\)/
    );
    // The sparkline draws its endpoint ring in --surface, which is white in the
    // light theme and would sit as a white dot on ink without this override.
    expect(landingStyles).toMatch(/\.outcomeBand \{[\s\S]*?--surface: var\(--landing-ink\)/);
    // Illustrative figures must be labelled as such wherever they appear.
    expect(landingSource).toContain("Illustrative figures from an example workspace.");
  });

  it("keeps the green status pairing readable on the light ground", () => {
    // The exact pairing that measured 1.12:1 in production. green-strong is a
    // color-mix, so it is recomputed here rather than trusted.
    const soft = tokenHex("marketing-success-soft");
    const strong = mixHex(
      tokenHex("marketing-success"),
      tokenHex("marketing-copy"),
      0.7
    );
    expect(contrastRatio(strong, soft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenHex("marketing-copy"), soft)).toBeGreaterThanOrEqual(7);
  });
});

describe("landing-page experience", () => {
  it("keeps the page scannable rather than a document", () => {
    /**
     * The complaint this encodes was "too overwhelming to read", and the first
     * attempt to measure it got the number wrong in a way worth recording: a
     * naive count of every string in the file returned 1,387 words, but 282 of
     * those sit inside a <details> FAQ that is collapsed until asked for, and
     * 244 more live inside interactive demo widgets. Neither is prose a visitor
     * confronts. Measuring what is actually on screen gave 706, and the honest
     * target moved with it.
     *
     * So this counts visible prose only, and caps the individual block rather
     * than just the total: a page can hit any word count and still read as
     * homework if it delivers it in four dense paragraphs. Both limits sit a
     * little above where the page currently is, so ordinary edits are free and
     * a drift back toward walls of text is not.
     */
    const arrayLiteral = (name: string) => {
      const start = landingSource.indexOf(`const ${name} = [`);
      if (start === -1) return "";
      let depth = 0;
      for (let i = landingSource.indexOf("[", start); i < landingSource.length; i++) {
        if (landingSource[i] === "[") depth++;
        else if (landingSource[i] === "]" && --depth === 0) return landingSource.slice(start, i + 1);
      }
      return "";
    };
    // Collapsed by default, or inside a widget the reader drives.
    const notConfronted = [
      "FAQ",
      "HERO_DEMO_STAGES",
      "HERO_MOTION_NODES",
      "VOICE_OPTIONS",
      "VARIANT_ENDINGS",
    ]
      .map(arrayLiteral)
      .join("");

    const source = landingSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const candidates = new Set<string>();
    for (const [, text] of source.matchAll(/"([^"\\]{20,})"/g)) candidates.add(text);
    for (const [, text] of source.matchAll(/>\s*([^<>{}\n]{20,})\s*</g)) candidates.add(text.trim());

    const noise = ["<", ">", "{", "}", "=", "()", "http", "/", "px", "var(", "styles."];
    const visible = [...candidates].filter(
      (text) =>
        text.includes(" ") &&
        !noise.some((token) => text.includes(token)) &&
        /^[A-Z"]/.test(text) &&
        !notConfronted.includes(text)
    );

    const total = visible.reduce((sum, text) => sum + text.split(/\s+/).length, 0);
    expect(visible.length, "prose blocks were found at all").toBeGreaterThan(30);
    expect(total, "visible words on the page").toBeLessThanOrEqual(650);

    const walls = visible.filter((text) => text.split(/\s+/).length > 32);
    expect(walls.map((text) => text.slice(0, 60))).toEqual([]);
  });

  it("uses a calm typographic wordmark in the public navigation", () => {
    const navigation = landingSource.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navigation).toContain("<Wordmark />");
    expect(navigation).not.toContain("<LogoMark");
  });

  it("keeps the top-right action readable above the global link rule", () => {
    // The colour now comes from the shared brand token rather than a literal,
    // so this asserts the intent (dark ink on the light pill) and checks the
    // resolved --foreground value for contrast.
    expect(landingStyles).toMatch(
      /\.root \.navStart \{[\s\S]*?color: var\(--landing-copy\);/
    );
    expect(
      contrastRatio(
        tokenHex("marketing-copy"),
        tokenHex("marketing-surface-2")
      )
    ).toBeGreaterThanOrEqual(4.5);
    expect(landingSource).toContain("Get started <Arrow />");
  });

  it("keeps Log in visible and touchable when zoom creates a narrow viewport", () => {
    expect(landingSource).toContain('<a className={styles.login} href="/sign-in">');
    expect(landingStyles).toMatch(
      /\.login \{[\s\S]*?display: inline-flex;[\s\S]*?min-height: 44px;/
    );

    /**
     * Stated as the rule rather than as "the block between 720px and 520px".
     * That locator assumed those two media queries were adjacent, so adding a
     * 560px block between them made this fail while nothing about Log in had
     * changed. What actually matters is that no breakpoint hides it, which is
     * checkable directly and does not care what else is in the file.
     */
    for (const [, selector, body] of landingStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display:\s*none/.test(body)) continue;
      expect(
        /(^|,)\s*\.login\s*(,|$)/.test(selector.trim()),
        `a rule hides .login: ${selector.trim().slice(0, 60)}`
      ).toBe(false);
    }
    // And the narrow breakpoint still gives it a size rather than dropping it.
    expect(landingStyles).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.login \{/);
  });

  it("qualifies deliverability claims instead of promising inbox placement", () => {
    /**
     * The most important guard on this page, and the reason it is written
     * against phrasings rather than one blessed sentence.
     *
     * Inbox placement is decided by the receiving provider from recipient
     * engagement, domain history, list quality and content. No sending tool
     * controls any of those, and Google makes no such promise about Gmail
     * either, so a page that promises placement is describing a product that
     * cannot exist. The pull towards writing it anyway is constant, because it
     * is the single thing a buyer most wants to hear.
     *
     * Two phrasings used to be banned by name. The hero has since been rewritten
     * around a Gmail visual whose entire job is to suggest deliverability, so
     * the ban is broadened here rather than left pinned to the two sentences
     * that happened to exist in 2025.
     */
    for (const promise of [
      "keeps them out of spam",
      "Outreach that lands in the inbox",
      "lands in the inbox",
      "never hit spam",
      "guaranteed delivery",
      "stay out of spam",
      "avoid the spam folder",
      // Added after the guard above shipped and promptly failed to catch a claim
      // that was already on the page: a feature titled "Volume without the spam
      // folder". A list of banned sentences only ever catches the sentences
      // someone thought of, so the entries below cover the shapes rather than
      // the wordings, and the assertion after this loop catches the rest.
      "without the spam folder",
      "no spam folder",
      "skip the spam folder",
      "bypass spam",
      // Note the missing entry: "guarantee inbox" cannot be banned as a
      // substring, because the page's own disclaimer reads "No platform can
      // guarantee inbox placement or replies". A flat substring ban flags the
      // one sentence that makes the page honest, which is why the promissory
      // first person is banned instead.
      "we guarantee",
    ]) {
      expect(landingSource.toLowerCase()).not.toContain(promise.toLowerCase());
    }

    /**
     * The catch-all, because the list above is only ever as good as the
     * imagination of whoever last edited it. Any sentence that puts "spam" or
     * "inbox" within a few words of a word implying avoidance or arrival is
     * flagged for a human to look at, whether or not anyone predicted it.
     *
     * Exempted: the anti-spam policy link, and copy that explains why identical
     * text is easy for a filter to catch, which is education rather than a
     * promise.
     */
    const claims = [
      ...landingSource.matchAll(
        /[^.!?\n]*\b(?:spam|inbox)\b[^.!?\n]*/gi
      ),
    ]
      .map((match) => match[0].trim())
      .filter(
        (line) =>
          // Education and policy, not promises: the anti-spam link, the
          // explanation of why identical text is easy to filter, and the FAQ
          // question whose answer is the disclaimer itself.
          !/anti-spam|spam filter|easiest thing in the world|spam complaints|guarantee replies or inbox placement/i.test(
            line
          )
      )
      .filter((line) => /\b(?:without|avoid|never|skip|bypass|guarantee|ensure|always|straight to|land)\b/i.test(line))
      // The disclaimer is the sentence that makes the page honest, not a claim.
      .filter((line) => !/No platform can guarantee/i.test(line));
    expect(claims).toEqual([]);

    // And the qualification has to be present, not merely the promise absent.
    expect(landingSource).toContain("No platform can guarantee inbox placement or replies.");

    // The page must still show the deliverability *work*, which is what makes
    // the qualified position credible rather than evasive. This lived in a
    // proof bar that the new hero replaced; it is now the authentication row
    // inside the hero visual.
    const proof = readFileSync("components/marketing/InboxProof.tsx", "utf8");
    for (const signal of ["SPF", "DKIM", "DMARC", "Bounce rate", "Paced across"]) {
      expect(proof).toContain(signal);
    }
    // Illustrative figures must say so. A visitor should never read the example
    // workspace's numbers as a forecast of their own.
    expect(proof).toContain("Example workspace");
  });

  it("sells the outreach rather than the volume", () => {
    /**
     * A sibling of the deliverability guard above, and it exists for a reader
     * nobody writes marketing copy for: the Google OAuth reviewer.
     *
     * This app requests a restricted Gmail scope, so a human at Google reads
     * this page and decides what the product is for. The Workspace
     * acceptable-use policy prohibits using Gmail to "generate, distribute,
     * publish or facilitate unsolicited mass email", and a hero whose opening
     * words are a volume boast is hard to distinguish from exactly that,
     * however disciplined the software underneath.
     *
     * An earlier version of this guard also asserted the volume claim was
     * *false*, on the grounds that the default daily limit is 100. That was
     * wrong and the assertion is gone: 100 is the default, not the ceiling. A
     * warmed inbox sends 150 a day, the per-campaign maximum is 2000, and
     * inbox rotation spreads volume across a pool, so thousands a month is
     * true on the smallest plan. Understating capacity is its own failure on a
     * landing page, so what is enforced below is the vocabulary and the
     * timeframe, not the magnitude.
     */
    /**
     * Checked against the copy with comments stripped, unlike the
     * deliverability guard above. That one bans phrasings nobody should write
     * anywhere; this one bans phrasings nobody should *ship*, and the comment
     * beside the hero explaining why the old wording went has to be able to
     * name what it is talking about. A guard that forbids describing itself
     * gets worked around rather than understood.
     */
    const shipped = landingSource
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .toLowerCase();

    // Guard the guard: over-eager comment stripping would leave an empty string
    // that passes every assertion below without checking anything.
    expect(shipped).toContain("thousands a month.");
    expect(shipped.length).toBeGreaterThan(landingSource.length / 2);

    for (const boast of [
      "send thousands",
      "send millions",
      "unlimited sends",
      "unlimited emails",
      "mass email",
      "email blast",
      "blast out",
      "bulk send",
    ]) {
      expect(shipped).not.toContain(boast);
    }

    /**
     * A volume claim must carry a timeframe.
     *
     * This is the rule that replaced banning big numbers, and it is the one
     * that actually separates the two readings. "Thousands a month" describes
     * capacity: it invites the reader to divide by thirty and see a paced
     * operation. A bare count with no unit describes an event, and an event is
     * what the acceptable-use policy means by mass email. The number is allowed
     * to be as large as it is true; it just has to say per what.
     */
    const untimed = [...shipped.matchAll(/\b(?:thousands|millions)\b[^.!?\n]{0,40}/g)]
      .map((match) => match[0].trim())
      .filter((line) => !/\b(?:a|per|each|every)\s+(?:day|week|month|quarter|year)\b/.test(line));
    expect(
      untimed,
      "a volume claim needs a timeframe, or it reads as a blast"
    ).toEqual([]);

    // The pacing disclaimer is what makes a reach claim credible, so it has to
    // be present rather than merely un-contradicted.
    expect(landingSource).toContain("Provider limits are ceilings");
  });

  it("uses only the semantic warm palette and keeps text pairs at AA contrast", () => {
    expect(landingDeclarations.match(/#[0-9a-fA-F]{3,8}/g) ?? []).toHaveLength(0);

    const textPairs = [
      ["marketing-copy", "marketing-paper"],
      ["marketing-muted", "marketing-paper"],
      ["marketing-copy", "marketing-surface"],
      ["marketing-muted", "marketing-surface"],
      ["marketing-on-ink", "marketing-ink"],
      ["marketing-on-ink-muted", "marketing-ink"],
      ["marketing-on-ink-subtle", "marketing-ink"],
      ["marketing-primary", "marketing-paper"],
      ["marketing-info", "marketing-paper"],
      ["marketing-primary-contrast", "marketing-primary"],
    ] as const;

    for (const [foreground, background] of textPairs) {
      expect(
        contrastRatio(tokenHex(foreground), tokenHex(background)),
        `${foreground} on ${background}`
      ).toBeGreaterThanOrEqual(4.5);
    }

    /**
     * These mirror the color-mix() expressions in the landing stylesheet, and
     * they must read the --marketing-* ramp rather than the app tokens of the
     * same name. They used to read the app tokens and agreed by coincidence,
     * because :root happened to be the light theme. :root is the dark theme
     * now, so `success` here resolved to the luminous mint and this failed at
     * 3.09:1 -- which is the test noticing the coincidence had ended, exactly
     * the failure mode the whole marketing ramp exists to prevent.
     */
    const semanticTextPairs = [
      [mixHex(tokenHex("marketing-success"), tokenHex("marketing-copy"), 0.7), tokenHex("marketing-paper")],
      [mixHex(tokenHex("marketing-revenue"), tokenHex("marketing-copy"), 0.68), tokenHex("marketing-paper")],
      [mixHex(tokenHex("marketing-danger"), tokenHex("marketing-copy"), 0.72), tokenHex("marketing-paper")],
      [mixHex(tokenHex("marketing-on-ink"), tokenHex("marketing-danger"), 0.54), tokenHex("marketing-ink")],
    ] as const;

    for (const [foreground, background] of semanticTextPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }

    for (const retiredColdColor of ["#718096", "#7a8799", "#2777e9", "#c7d7eb", "#d7e0eb"]) {
      expect(landingStyles.toLowerCase()).not.toContain(retiredColdColor);
    }
  });

  it("sends every primary call to action to the real sign-in", () => {
    // The site used to gate itself behind an email-capture field labelled
    // "Request a pilot". The product is something you can start using, so
    // Get started is a link to /sign-in everywhere it appears, and no CTA
    // implies that billing or plan selection happens on this page.
    expect(landingSource).toContain("function StartLink");
    expect(landingSource).toContain('<Link className={className} href="/sign-in">');
    expect(landingSource.match(/<StartLink/g)?.length).toBeGreaterThanOrEqual(3);
    expect(landingStyles).not.toMatch(/pilot/i);
  });

  it("centers and focuses the contact field from the secondary CTA", () => {
    expect(landingSource).toContain("function ContactLink");
    expect(landingSource).toContain('block: "center"');
    expect(landingSource).toContain('"scrollend"');
    expect(landingSource).toContain("fallback = window.setTimeout");
    expect(landingSource).toContain("input.focus()");
    expect(landingSource).toContain("aria-controls={CONTACT_EMAIL_ID}");
    expect(landingSource.match(/<ContactLink/g)?.length).toBeGreaterThanOrEqual(2);
    expect(landingStyles).toMatch(
      /\.contactAnchor \{[\s\S]*?scroll-margin-top: 96px;/
    );
  });

  it("keeps the contact form legible wherever the section puts it", () => {
    // It was a translucent white-on-white sliver that only worked on the dark
    // hero. It is now a solid card, so it reads the same on either ground,
    // while the helper text beneath it stays an on-ink neutral because it
    // sits directly on the closing panel.
    const form = landingStyles.match(/\.waitForm \{[\s\S]*?\n\}/)?.[0] ?? "";
    const input = landingStyles.match(/\.waitForm input \{[\s\S]*?\n\}/)?.[0] ?? "";
    const note = landingStyles.match(/\.formNote,\n\.formError \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(form).toContain("background: var(--landing-surface)");
    expect(input).toContain("color: var(--landing-copy)");
    expect(note).toContain("color: var(--landing-on-ink-muted)");
    expect(
      contrastRatio(tokenHex("marketing-copy"), tokenHex("marketing-surface"))
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokenHex("marketing-on-ink-muted"), tokenHex("marketing-ink"))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("does not open every section with the same three elements", () => {
    /**
     * Five bands opened with the identical eyebrow, headline, paragraph stack,
     * left aligned, one after another. Each one was fine alone. The repetition
     * was the defect: past the third identical opening a reader stops
     * registering a new section starting and reads the page as one column,
     * which is a large part of what "the grid feels weak" was describing.
     *
     * The rule is about variety rather than any particular treatment, so it
     * counts how many openings fall back to the default stack rather than
     * naming which section should use which. Both named variants are also
     * checked to exist in the stylesheet, because a renamed class would
     * otherwise satisfy this by applying nothing at all.
     */
    const openings = landingSource.match(/styles\.sectionHeading\b/g) ?? [];
    expect(openings.length).toBeGreaterThanOrEqual(5);

    for (const variant of ["sectionHeadingSplit", "sectionHeadingCentered"]) {
      expect(landingSource).toContain(`styles.${variant}`);
      expect(landingDeclarations).toContain(`.${variant} {`);
    }

    const varied =
      (landingSource.match(/styles\.sectionHeadingSplit\b/g) ?? []).length +
      (landingSource.match(/styles\.sectionHeadingCentered\b/g) ?? []).length;
    const plain = openings.length - varied;
    expect(varied).toBeGreaterThanOrEqual(2);
    expect(plain).toBeLessThanOrEqual(Math.floor(openings.length / 2));

    // Centring is the one that stops working if it is spent twice.
    expect(
      (landingSource.match(/styles\.sectionHeadingCentered\b/g) ?? []).length
    ).toBe(1);
  });

  it("never runs two dark bands into each other", () => {
    /**
     * The trust band and the metrics band were both full-bleed ink and sat
     * next to each other in the markup, so the page carried one uninterrupted
     * dark stretch with a seam in the middle where the headline sizes changed.
     * Nothing at that seam said a new section had started.
     *
     * This reads the section order out of the markup and the ground out of the
     * stylesheet rather than pinning the two class names, so it still holds if
     * a third dark band is added later.
     */
    const sections = [
      ...landingSource.matchAll(
        /<section\s+className=\{styles\.(\w+)\}/g
      ),
    ].map((match) => match[1]);
    expect(sections.length).toBeGreaterThanOrEqual(6);

    const groundOf = (className: string): string => {
      let ground = "";
      for (const [, selector, body] of landingDeclarations.matchAll(
        /([^{}]*)\{([^{}]*)\}/g
      )) {
        if (!new RegExp(`\\.${className}\\b`).test(selector)) continue;
        const declared = body.match(/(?:^|;)\s*background:\s*([^;]+)/)?.[1];
        if (declared) ground = declared.trim();
      }
      return ground;
    };

    const isDark = (ground: string) =>
      ground.includes("--landing-ink") && !ground.includes("--landing-paper");

    const grounds = sections.map(groundOf);
    expect(grounds.filter(isDark).length).toBeGreaterThanOrEqual(1);

    for (let index = 1; index < sections.length; index += 1) {
      if (isDark(grounds[index]) && isDark(grounds[index - 1])) {
        throw new Error(
          `${sections[index - 1]} and ${sections[index]} are both dark bands and sit next to each other`
        );
      }
    }
  });

  it("keeps one radius ladder and no tinted washes", () => {
    // Seventeen ad-hoc radii are what made the site read softer and cheaper than
    // the product it advertises.
    // 999px is a pill and 50% is a circle: both are shapes, not radii.
    const literalRadii = (landingDeclarations.match(/border-radius: \d+px/g) ?? []).filter(
      (declaration) => !declaration.endsWith("999px")
    );
    expect(literalRadii).toHaveLength(0);
    for (const token of ["--landing-r-sm", "--landing-r-lg", "--landing-r-xl"]) {
      expect(landingStyles).toContain(`${token}: var(--radius-`);
    }
    // Tinted radial washes behind sections and panels are gone.
    expect(landingStyles).not.toContain("radial-gradient(circle at");
  });

  it("elevates only from the ladder, and only the surfaces that are objects", () => {
    /**
     * This assertion has been inverted on purpose, so the reason is worth
     * recording rather than just the new value.
     *
     * It used to require that the only non-`none` shadow on the page was an
     * inset ring: the page was deliberately flattened after an earlier version
     * carried sixty-two shadows and read cheap. The premise was half right. What
     * reads cheap is a *visible* shadow. One built from a large blur, a large
     * negative spread and a low opacity is not perceived as a shadow at all,
     * only as separation, and a page where nothing separates is itself a reason
     * the site read flatter than the product.
     *
     * So the rule is no longer "no elevation". It is that elevation may only
     * come from the shared ladder, never from a literal, which is what stops the
     * sixty-two hand-tuned shadows growing back one commit at a time.
     */
    // Matched then filtered, rather than excluded with a lookahead. Writing this
    // as /box-shadow:\s*(?!none)[^;]+;/ does not work: \s* backtracks to zero
    // width, so the lookahead gets tested against " none" instead of "none",
    // passes, and every flat declaration comes back as a violation.
    const allShadows = landingDeclarations.match(/box-shadow:[^;]+;/g) ?? [];
    const shadows = allShadows.filter((shadow) => !/box-shadow:\s*none\s*;/.test(shadow));
    expect(shadows.length).toBeGreaterThan(5);

    const literal = shadows.filter(
      (shadow) =>
        !shadow.includes("var(--landing-shadow") &&
        // Inset focus and selection rings are not elevation and stay allowed.
        !shadow.includes("inset 0 0 0")
    );
    expect(literal).toEqual([]);

    /**
     * The marks stay flat. Dots, pill indicators and tab states were right to
     * have no shadow, so a blanket find-and-replace would have been wrong.
     *
     * The floor stepped from 30 to 6 when ~2,200 lines of dead CSS came out of
     * this file. Most of those `none` declarations lived inside the four
     * interactive demos that were removed from the JSX long ago and whose rules
     * were never deleted, so the old number was counting code that had not
     * rendered in months. Recalibrated against what actually ships rather than
     * relaxed: it is still tight enough that flattening the real marks fails.
     */
    expect((landingDeclarations.match(/box-shadow:\s*none/g) ?? []).length).toBeGreaterThan(6);
  });

  it("keeps the interactive product demos off the landing page", () => {
    /**
     * This test and three others used to guard four inline demos: a staged hero
     * walkthrough, a compose demo, an operations console, and the variation
     * demo. They were removed after direct feedback that the how-it-works demo
     * was too complicated and tedious, which it was: the page asked a visitor who
     * had decided nothing to operate a product they had not bought.
     *
     * The demos were not deleted as a category. /demo runs the real application
     * components against sample data, which is a better demonstration than any
     * of the four mock-ups were, and the landing page links to it. The variation
     * demo moved there intact because it runs the shipped spintax parser and is
     * therefore evidence rather than decoration.
     *
     * What this asserts now is the decision: the heavy inline demos stay off the
     * page, and the route that replaced them is linked from it.
     */
    expect(landingSource).not.toContain("const HERO_DEMO_STAGES");
    expect(landingSource).not.toContain('role="tablist"');
    expect(landingSource).toContain('href="/demo"');
  });

  it("gives the hero motion that arrives and then settles", () => {
    /**
     * Rewritten for the hero that exists. The old assertions described the
     * staged walkthrough's clock and sweep animations, which went with it.
     *
     * The current hero is the Gmail panel, and the brief was that it should
     * move: the frame arrives, the side panel follows just behind so the pair
     * reads as one object assembling, the authentication chips tick over in
     * sequence, and a send pulse travels the edge of the mail window because the
     * claim of the page is volume moving at a steady rhythm.
     *
     * Every one of those is transform and opacity so none of it costs layout,
     * and every one is disabled under reduced motion, which is the part that
     * matters more than the effect.
     */
    for (const animation of ["proofArrive", "sendPulse", "chipIn"]) {
      expect(landingStyles, `${animation} exists`).toContain(`@keyframes ${animation}`);
    }
    const reduced = landingStyles.slice(landingStyles.lastIndexOf("(prefers-reduced-motion: reduce)"));
    for (const selector of [".inboxProof", ".proofPanel", ".mailWindow::after"]) {
      expect(reduced, `${selector} stops under reduced motion`).toContain(selector);
    }
  });

  it("makes exactly one network call, and only to the waitlist", () => {
    /**
     * The demos are gone, so the "example control does not send email" notices
     * went with them. The rule underneath is unchanged and is the one worth
     * keeping: the marketing page must not reach a production API. The contact
     * form is the single permitted exception.
     */
    const fetches = landingSource.match(/fetch\(/g) ?? [];
    expect(fetches).toHaveLength(1);
    expect(landingSource).toContain('fetch("/api/waitlist"');
  });

  it("still promises human approval, which the deleted demo used to show", () => {
    /**
     * The compose demo carried "Human review required" and "Approve draft" as
     * interface labels. Deleting it removed the only place the page made that
     * promise visually, and human approval is a claim worth keeping: it is the
     * difference between this and a tool that sends unreviewed AI output.
     * The copy has to carry it now, so this checks the copy rather than the
     * demo chrome.
     */
    expect(landingSource).toMatch(/approve every (?:one|send)/i);
  });

  it("leads with a strong but qualified business outcome", () => {
    // The headline was rewritten to three beats with the middle one accented,
    // matching the reference designs this redesign is working from. The
    // assertion moved with it rather than being dropped, because what it is
    // really protecting is that the lead claim stays about behaviour the
    // product controls: sending volume, sounding personal, earning replies.
    // First beat rewritten from "Send thousands." The three-beat shape and the
    // accented middle are what this protects; the opening claim moved to reach
    // rather than raw volume, for the reasons in the volume guard above.
    expect(landingSource).toContain("Thousands a month.");
    expect(landingSource).toContain("<em>Sound like one person.</em>");
    expect(landingSource).toContain("Get replies.");
    expect(landingSource).toContain(
      "No platform can guarantee inbox placement or replies."
    );
    /**
     * This pinned a sentence that lived inside the deleted pacing demo. The
     * claim survives in the FAQ, which says provider limits are technical
     * ceilings rather than outreach recommendations, so what is asserted is the
     * claim rather than the wording that happened to carry it. Losing the
     * sentence moved this from a visible section into a collapsed one, which is
     * a real reduction in prominence and is worth knowing.
     */
    expect(landingSource).toMatch(/limits are (?:technical )?ceilings, not/i);
  });

  it("turns off decorative animation for reduced-motion users", () => {
    expect(landingSource).toContain(
      '"(prefers-reduced-motion: reduce)"'
    );
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none !important;/
    );
  });

  it("uses fluid mobile layouts and practical touch targets", () => {
    expect(landingStyles).toContain("@media (max-width: 980px)");
    expect(landingStyles).toContain("@media (max-width: 720px)");
    expect(landingStyles).toContain("@media (max-width: 520px)");
    /**
     * The two assertions that used to sit here pinned touch targets on
     * `.demoStageTabs` and `.operationsTabs`, both of which belonged to the
     * interactive demos removed from the JSX. Their CSS survived until the dead
     * rules were swept, so these were checking a 52px tap target on a control
     * that had not rendered in months. Deleted rather than repointed: there is
     * no equivalent control on the page now, and the surviving assertion below
     * covers the one interactive element the hero actually has.
     */
    expect(landingStyles).toMatch(
      /@media \(max-width: 720px\) \{[\s\S]*?\.root \.navStart \{[\s\S]*?min-height: 44px;/
    );
  });
});

describe("the variation demo sells a feature that had shipped in silence", () => {
  const demo = readFileSync("components/marketing/VariationDemo.tsx", "utf8");

  it("runs the shipped parser rather than a mock-up", () => {
    // The whole value of this demo is that it cannot lie. A hand-written mock
    // would have been easier and would have become false the first time anyone
    // changed the parser, on a page whose job is to make a promise.
    expect(demo).toContain('from "@/lib/personalization/spintax"');
    expect(demo).toContain("expandSpintax(");
    expect(demo).toContain("analyzeSpintax(");
  });

  it("seeds each example the way the send worker does", () => {
    // The worker seeds on the recipient, so the four bodies shown are the four
    // those recipients would actually receive.
    expect(demo).toMatch(/expandSpintax\(TEMPLATE, recipient\.name\)/);
  });

  it("shows the off state, which is the actual argument", () => {
    // Four identical emails beside four different ones turns an abstract
    // deliverability claim into something visible in a second.
    expect(demo).toContain("const FLAT");
    expect(demo).toMatch(/identical/i);
  });

  it("is still reachable, from the playground rather than the landing page", () => {
    /**
     * This demo has now moved twice, and the reason it survived both moves is
     * the point of the test.
     *
     * It first sat in its own landing section, then in a tabbed group, and now
     * lives on /demo. The landing page dropped its four interactive demos
     * because asking a visitor who has decided nothing to operate a product they
     * have not bought is tedious, which was the feedback. But this one is
     * evidence rather than decoration: it runs the real parser, so deleting it
     * would have left the page claiming per-recipient variation with nothing
     * behind the claim.
     *
     * So the assertion is that it is reachable somewhere a person can get to,
     * and that the landing page still points at that place.
     */
    const demoPage = readFileSync("app/demo/page.tsx", "utf8");
    const landing = landingSource;
    expect(demoPage).toContain("<VariationDemo />");
    expect(landing).toContain('href="/demo"');
  });

  it("keeps the landing page free of the heavy inline demos", () => {
    // The feedback was that the how-it-works demo was too complicated and
    // tedious. This stops it, or anything like it, drifting back inline.
    const landing = landingSource;
    for (const gone of ["<DemoTabs", "<HeroDemo", "<MessageDemo", "<OperationsDemo"]) {
      expect(landing, `${gone} stays off the landing page`).not.toContain(gone);
    }
  });

  it("names the shipped work the site used to omit entirely", () => {
    // Spintax, inbox rotation, warmup, the bounce brake, and the API were all
    // built and none of them appeared anywhere on the marketing site: it
    // described a product several rounds out of date.
    //
    // Written as patterns rather than three exact sentences. The point is that
    // these capabilities are named somewhere on the page, not that they are
    // named in the words someone happened to use in 2025: a copy pass that
    // shortened "rotates across them" to "rotates across your connected Gmail
    // accounts" broke this while making the page strictly better.
    const landing = landingSource;
    const capabilities: Array<[string, RegExp]> = [
      ["inbox rotation", /rotat\w* across/i],
      ["warmup ramp", /ramps?\b[^.]{0,40}four weeks/i],
      ["webhooks", /webhook/i],
      // Matched on the capability rather than one noun, for the reason stated
      // above: a copy pass moved this from "builds the combinations" to "writes
      // the alternate phrasings" while describing the same feature better.
      ["spintax", /combinations|alternate phrasings|versions of one email/i],
      ["bounce brake", /bouncing pauses/i],
      /**
       * Added after this test caught the same drift a second time. Brand voice
       * learned from a URL, prospect research, and AI lead grouping all shipped
       * while the page still described marking your own phrases by hand, which
       * had stopped being true. The site understating the product is a quieter
       * failure than overstating it and just as worth catching.
       */
      ["brand voice from your own site", /reads what you sell|learns how you sound/i],
      ["prospect research", /each prospect's own website/i],
    ];
    for (const [name, pattern] of capabilities) {
      expect(pattern.test(landing), `${name} is named on the page`).toBe(true);
    }
  });
});

/**
 * Tokens used on the wrong ground.
 *
 * This failure has now happened three times on this page, each time in a way
 * that compiled, passed every test, and was invisible until someone looked at
 * the rendered site:
 *
 *   1. The hero glow drew white at 3% on a near-black ground, a delta of about
 *      six values per channel, which is at or below what an eye can resolve.
 *   2. The sticky nav hardcoded the ink of a palette two generations back, so
 *      it rendered blue above a green page all the way to production.
 *   3. The palette went monochrome, --landing-action became black, and the
 *      hero's primary button became a black button on a near-black hero. The
 *      "Built for Gmail" pill and the trust-band icon tiles went with it.
 *
 * All three are the same mistake: a value that is right on paper used on ink.
 * Contrast tests do not catch it, because they check token pairs rather than
 * which pairs a rule actually puts together.
 *
 * So this reads the rules that live on a dark ground and requires them to draw
 * only from the ink vocabulary. The list of dark selectors is maintained by
 * hand, which is a real cost, so it is checked for staleness too: every
 * selector named here must still exist and must still be dark.
 */
describe("the dark bands draw from the ink vocabulary", () => {
  /** Rules that render on ink, and therefore may not reach for a paper token. */
  const ON_INK = [
    "nav",
    "hero",
    "heroGlow",
    "heroPrimary",
    "heroSecondary",
    "heroNote",
    "pill",
    "trustSection",
    "trustGrid",
    "trustCopy",
    "outcomeLayout",
    "outcomeStat",
    "outcomeNote",
    "finalPanel",
    "footer",
  ];

  /**
   * Tokens whose value is chosen to sit on paper. On ink they are somewhere
   * between low-contrast and invisible, and --landing-action is now literally
   * the same colour as the band.
   */
  const PAPER_ONLY = [
    "--landing-action",
    "--landing-action-deep",
    "--landing-action-soft",
    "--landing-copy",
    "--landing-copy-soft",
    "--landing-muted",
    "--landing-gold",
    "--landing-info",
    "--landing-line",
    "--landing-paper",
  ];

  /** Every top-level rule in the file, as [selector, body]. */
  function rules(): Array<[string, string]> {
    return [...landingDeclarations.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(
      (match) => [match[1].trim(), match[2]]
    );
  }

  it("names only selectors that exist and are actually dark", () => {
    // A stale entry is worse than no entry: it makes the rule below look like
    // it covers ground it does not.
    for (const name of ON_INK) {
      expect(
        new RegExp(`\\.${name}\\b`).test(landingDeclarations),
        `.${name} is in the dark-ground list but not in the stylesheet`
      ).toBe(true);
    }
    // The bands themselves must still be painted with the ink token. If one of
    // them goes light, it belongs out of this list, not silently inside it.
    for (const band of ["nav", "hero", "trustSection", "finalPanel", "footer"]) {
      const own = rules().filter(([selector]) =>
        new RegExp(`(^|,\\s*)\\.${band}\\s*$`).test(selector)
      );
      expect(own.length, `.${band} has no rule of its own`).toBeGreaterThan(0);
      expect(
        own.some(([, body]) => /background:[^;]*--landing-ink/.test(body)),
        `.${band} is in the dark-ground list but is not painted with the ink token`
      ).toBe(true);
    }
  });

  it("never puts a paper token on an ink ground", () => {
    const offenders: string[] = [];
    for (const [selector, body] of rules()) {
      const onInk = ON_INK.some((name) =>
        new RegExp(`\\.${name}\\b`).test(selector)
      );
      if (!onInk) continue;
      for (const token of PAPER_ONLY) {
        // `var(--landing-action-on-ink)` is the ink-safe sibling and must not
        // trip its own prefix, so the boundary matters.
        if (new RegExp(`${token}[),\\s]`).test(body)) {
          offenders.push(`${selector} uses ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still has dark bands to check", () => {
    // Floor. If the page stops having ink sections, the rule above passes by
    // describing nothing.
    const inkRules = rules().filter(([, body]) =>
      /background:[^;]*var\(--landing-ink\)/.test(body)
    );
    expect(inkRules.length).toBeGreaterThanOrEqual(4);
  });
});

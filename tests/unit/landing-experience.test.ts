import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
  "components/marketing/Landing.tsx",
  "utf8"
);
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
  const darkBlock = (() => {
    const start = globalStyles.indexOf(':root[data-theme="dark"] {');
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

  it("resolves every --landing-* token through the theme-invariant ramp", () => {
    const declarations = [
      ...landingStyles.matchAll(/^\s*(--landing-[\w-]+):\s*([^;]+);/gm),
    ];
    expect(declarations.length).toBeGreaterThan(30);

    const leaks: string[] = [];
    for (const [, name, value] of declarations) {
      for (const [, referenced] of value.matchAll(/var\(\s*--([\w-]+)/g)) {
        // Referencing another --landing-* token is fine; it is checked on its
        // own declaration. Only a direct read of a theme-remapped app token is a
        // leak. --marketing-*, --radius-* and --ease-* are invariant by
        // construction and so never appear in the set.
        if (referenced.startsWith("landing-")) continue;
        if (themeDependent.has(referenced)) {
          leaks.push(`${name} reads --${referenced}`);
        }
      }
    }
    expect(leaks).toEqual([]);
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
    const narrowStyles = landingStyles.match(
      /@media \(max-width: 720px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 520px\)/
    )?.[1] ?? "";
    expect(landingSource).toContain('<a className={styles.login} href="/sign-in">');
    expect(landingStyles).toMatch(
      /\.login \{[\s\S]*?display: inline-flex;[\s\S]*?min-height: 44px;/
    );
    expect(narrowStyles).toContain(".login {");
    expect(narrowStyles).not.toContain("display: none");
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
      // Note the missing entry: "guarantee inbox" cannot be banned as a
      // substring, because the page's own disclaimer reads "No platform can
      // guarantee inbox placement or replies". A flat substring ban flags the
      // one sentence that makes the page honest, which is why the promissory
      // first person is banned instead.
      "we guarantee",
    ]) {
      expect(landingSource.toLowerCase()).not.toContain(promise.toLowerCase());
    }

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

    const semanticTextPairs = [
      [mixHex(tokenHex("success"), tokenHex("marketing-copy"), 0.7), tokenHex("marketing-paper")],
      [mixHex(tokenHex("revenue"), tokenHex("marketing-copy"), 0.68), tokenHex("marketing-paper")],
      [mixHex(tokenHex("danger"), tokenHex("marketing-copy"), 0.72), tokenHex("marketing-paper")],
      [mixHex(tokenHex("marketing-on-ink"), tokenHex("danger"), 0.54), tokenHex("marketing-ink")],
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

    // The marks stay flat. Dots, pill indicators, tab states and keyframes were
    // right to have no shadow, and there are far more of them than there are
    // cards, so a blanket find-and-replace would have been the wrong move.
    expect((landingDeclarations.match(/box-shadow:\s*none/g) ?? []).length).toBeGreaterThan(30);
  });

  it("makes the hero walkthrough user controlled and keyboard operable", () => {
    expect(landingSource).toContain("const HERO_DEMO_STAGES");
    expect(landingSource).toContain('role="tablist"');
    expect(landingSource).toContain('role="tab"');
    expect(landingSource).toContain("Pause walkthrough");
    expect(landingSource).toContain("setPlaying(false)");
    expect(landingSource).toContain('event.key === "ArrowRight"');
    expect(landingSource).toContain('event.key === "ArrowLeft"');
    expect(landingSource).toContain("IntersectionObserver");
    expect(landingSource).toContain("Interactive example");
  });

  it("makes premium hero motion obvious immediately and pauses it responsibly", () => {
    expect(landingSource).toContain("HERO_STAGE_DURATION_MS = 2300");
    expect(landingSource).toContain("Live walkthrough");
    expect(landingSource).toContain("HERO_MOTION_NODES");
    expect(landingSource).toContain("Live action");
    expect(landingSource).toContain('document.visibilityState === "visible"');
    expect(landingSource).toContain(
      'aria-live={autoplayActive ? "off" : "polite"}'
    );
    expect(landingSource).toContain("pointerFrameRef");
    expect(landingStyles).toContain("@keyframes activeStageClock");
    expect(landingStyles).toContain("@keyframes signalSweep");
    expect(landingStyles).toContain("animation-timeline: view()");
    expect(landingStyles).toContain("contain: paint");
    expect(landingStyles).toMatch(
      /@keyframes heroReveal \{[\s\S]*?from \{[\s\S]*?opacity: 0\.72;/
    );
    expect(landingStyles).toMatch(
      /@keyframes frameReveal \{[\s\S]*?from \{[\s\S]*?opacity: 0\.42;/
    );
  });

  it("keeps demo interactions deterministic and away from production APIs", () => {
    const fetches = landingSource.match(/fetch\(/g) ?? [];
    expect(fetches).toHaveLength(1);
    expect(landingSource).toContain('fetch("/api/waitlist"');
    expect(landingSource).toMatch(
      /This example control does not send email or change a real\s+account\./
    );
    expect(landingSource).toContain("Example data, last");
  });

  it("supports before-and-after AI copy, variants, and human approval", () => {
    expect(landingSource).toContain("Before AI");
    expect(landingSource).toContain("AI-assisted");
    expect(landingSource).toContain("Brand voice");
    expect(landingSource).toContain("Human review required");
    expect(landingSource).toContain("Approve draft");
  });

  it("leads with a strong but qualified business outcome", () => {
    // The headline was rewritten to three beats with the middle one accented,
    // matching the reference designs this redesign is working from. The
    // assertion moved with it rather than being dropped, because what it is
    // really protecting is that the lead claim stays about behaviour the
    // product controls: sending volume, sounding personal, earning replies.
    expect(landingSource).toContain("Send thousands.");
    expect(landingSource).toContain("<em>Sound like one person.</em>");
    expect(landingSource).toContain("Get replies.");
    expect(landingSource).toContain(
      "No platform can guarantee inbox placement or replies."
    );
    expect(landingSource).toContain(
      "Provider limits are ceilings, not a universal target."
    );
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
    expect(landingStyles).toMatch(
      /\.demoStageTabs button \{[\s\S]*?min-height: 52px;/
    );
    expect(landingStyles).toMatch(
      /\.operationsTabs button \{[\s\S]*?min-height: 44px;/
    );
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

  it("is reachable from the page and named in the copy", () => {
    const landing = readFileSync("components/marketing/Landing.tsx", "utf8");
    expect(landing).toContain("<VariationDemo />");
    expect(landing).toContain('id="variation"');
  });

  it("names the shipped work the site used to omit entirely", () => {
    // Spintax, inbox rotation, warmup, the bounce brake, and the API were all
    // built and none of them appeared anywhere on the marketing site: it
    // described a product several rounds out of date.
    const landing = readFileSync("components/marketing/Landing.tsx", "utf8");
    for (const claim of ["rotates across them", "ramps up over four weeks", "webhooks"]) {
      expect(landing.toLowerCase(), claim).toContain(claim.toLowerCase());
    }
  });
});

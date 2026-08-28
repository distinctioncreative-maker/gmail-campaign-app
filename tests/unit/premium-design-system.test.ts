import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The token ladders, which are the whole of the redesign's phase one.
 *
 * These are worth testing because both ladders had failed silently before, in
 * ways no build or typecheck could notice: the radius ladder topped out at 10px
 * so 279 call sites rendered as near-rectangles, and the elevation ladder was
 * three `none`s that were never mapped into Tailwind, so `shadow-md` in a
 * component meant something entirely different from `--shadow-md` in the
 * stylesheet.
 */
describe("token ladders", () => {
  const css = read("app/globals.css");

  function token(name: string, scope = ":root {"): string {
    const start = css.indexOf(scope);
    const block = css.slice(start, css.indexOf("\n}", start));
    const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    return match ? match[1].trim() : "";
  }

  it("has a radius ladder that ascends and clears the 2012 line", () => {
    const px = (name: string) => Number(token(name).replace("px", ""));
    const sm = px("--radius-sm");
    const md = px("--radius-md");
    const lg = px("--radius-lg");
    const xl = px("--radius-xl");
    expect(sm).toBeLessThan(md);
    expect(md).toBeLessThan(lg);
    expect(lg).toBeLessThan(xl);
    // The card radius is the single value that decides whether the product
    // reads as current. 8px is the Bootstrap 3 default and is what it was.
    expect(lg).toBeGreaterThanOrEqual(12);
  });

  it("has no elevation token set to none, in either theme", () => {
    // `none` is not a soft shadow, it is the absence of a ladder. Worse, it is
    // contagious: `box-shadow: var(--shadow-sm), 0 1px 3px ...` with --shadow-sm
    // as `none` is invalid CSS and the browser drops the whole declaration, so
    // an unrelated rule loses its shadow too. That shipped and went unnoticed.
    for (const name of ["--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl"]) {
      expect(token(name), `light ${name}`).not.toBe("none");
      expect(token(name, ':root[data-theme="dark"] {'), `dark ${name}`).not.toBe("none");
    }
  });

  it("never puts none inside a comma-separated box-shadow list", () => {
    // The general form of the bug above.
    const lists = css.match(/box-shadow:[^;]+;/g) ?? [];
    const broken = lists.filter((line) => /,/.test(line) && /\bnone\b/.test(line));
    expect(broken).toEqual([]);
  });

  it("maps elevation into Tailwind so components and CSS share one ladder", () => {
    // The brace matters: "@theme inline" also appears in a comment above the
    // radius ladder, and matching that grabbed :root instead.
    const theme = css.slice(css.indexOf("@theme inline {"));
    const block = theme.slice(0, theme.indexOf("\n}"));
    for (const name of ["--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl"]) {
      expect(block, name).toContain(`${name}: var(${name})`);
    }
  });

  it("gives dark mode a top highlight, since shadow cannot separate on a dark field", () => {
    // Black on near-black is invisible. A 1px inset highlight along the top edge
    // is how a real edge catches light and is the strongest depth cue dark mode
    // has. Light mode defines it transparent rather than `none`, because `none`
    // in a shadow list invalidates the declaration.
    expect(token("--edge-highlight")).toMatch(/rgba\(255,\s*255,\s*255,\s*0\)/);
    expect(token("--edge-highlight", ':root[data-theme="dark"] {')).toContain("inset");
  });

  it("routes every primitive through the ladder instead of a literal", () => {
    // The failure this catches is the one that actually happened. The ladder was
    // raised and nothing changed, because .btn, .segmented, .seg-btn and
    // .field-input each carried a hardcoded rem value, so the buttons and inputs
    // in the product never saw it. A ladder nothing references is decoration.
    //
    // .field-input is off this list because it no longer exists. It had one call
    // site and, once the base rule below owned the border, radius, surface and
    // padding, it was down to a width that call site was already setting.
    for (const selector of [".btn,", ".segmented {", ".seg-btn {"]) {
      const start = css.indexOf(selector);
      expect(start, selector).toBeGreaterThan(0);
      const block = css.slice(start, css.indexOf("\n}", start));
      const radius = block.match(/border-radius:\s*([^;]+);/);
      expect(radius, `${selector} declares a radius`).not.toBeNull();
      expect(radius![1], `${selector} uses the ladder`).toContain("var(--radius-");
    }
  });

  it("keeps the figure treatment overridable by a call site", () => {
    // .display-figure sets a font-size, and five of its seven call sites set
    // their own. Unlayered it would win over all of them and silently flatten
    // every KPI to one size. @layer base puts it below Tailwind's utilities.
    // The declaration, not the first mention: the class is named in the comment
    // above the layer too, and matching that looked for a @layer that had not
    // opened yet.
    const at = css.indexOf(".display-figure {");
    const layerAt = css.lastIndexOf("@layer base {", at);
    expect(layerAt).toBeGreaterThan(0);
    // The class must sit inside that block, not after it closed.
    expect(css.slice(layerAt, at)).not.toContain("\n}");
  });

  it("moves on press and nowhere else", () => {
    // Hover-lift makes a page twitch as the cursor crosses it. The press is what
    // makes a control feel physical, and it is the only transform in the system.
    // A previous pass removed the hover-lift rule but left both its comment and
    // the :disabled:hover guard for it, so the file described behaviour it did
    // not have.
    expect(css).toMatch(/\.btn-primary:active:not\(:disabled\)/);
    expect(css).not.toMatch(/\.btn-primary:hover\s*\{[^}]*translateY/);
  });

  it("gives every animation a reduced-motion escape", () => {
    // The one rule the motion system cannot break. Expressive was chosen over
    // restrained, which raises the stakes: someone with vestibular sensitivity
    // now has more to opt out of, not less.
    const reduced = css.slice(css.indexOf("(prefers-reduced-motion: reduce)"));
    for (const cls of [
      "stagger",
      "stagger-rows",
      "shimmer",
      "draw-bar",
      "grow-bar",
      "draw-line",
      "drift-field",
    ]) {
      expect(css, `.${cls} exists`).toContain(`.${cls}`);
      expect(reduced, `.${cls} is disabled under reduced motion`).toContain(`.${cls}`);
    }
  });

  it("animates transforms and opacity, never layout", () => {
    // A width or height keyframe reflows on every frame, and these run on
    // twenty table rows at once. Bars scale, they do not grow.
    // Brace-counted rather than pattern-matched. A regex ending at the next
    // "\n}" walks straight past a single-line @keyframes and swallows whatever
    // rule follows it, which made this fail on an unrelated declaration.
    const blocks: string[] = [];
    for (let i = css.indexOf("@keyframes"); i !== -1; i = css.indexOf("@keyframes", i + 1)) {
      let depth = 0;
      let end = i;
      for (let j = css.indexOf("{", i); j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) {
            end = j + 1;
            break;
          }
        }
      }
      blocks.push(css.slice(i, end));
    }
    expect(blocks.length).toBeGreaterThan(5);
    const offenders = blocks.filter((b) =>
      /\n\s*(width|height|margin|padding|top|left|right|bottom)\s*:/.test(b)
    );
    expect(offenders.map((b) => b.slice(0, 40))).toEqual([]);
  });

  it("counts up from a server-rendered value, not from zero", () => {
    // All 28 call sites are inside server-rendered pages, so initialising the
    // state at zero shipped a literal "0" in the HTML: correct for nobody, and
    // permanently wrong for a client with JavaScript off.
    const countUp = read("components/ui/CountUp.tsx");
    expect(countUp).toContain("useState(value)");
    expect(countUp).not.toMatch(/useState\(0\)/);
    // And reduced motion must skip the loop rather than run it fast.
    expect(countUp).toMatch(/if \(reduce \|\|/);
  });

  it("sets the wordmark in the display face", () => {
    // It rendered in the body face while every heading in the product used
    // Inter Tight, so the one piece of type that is the brand was the one piece
    // not using the brand face.
    const logo = read("components/ui/Logo.tsx");
    expect(logo).toContain("font-display");
    expect(logo).not.toMatch(/opacity-55/);
  });

  it("joins the marketing hero to the app with one ink language", () => {
    // The sign-in panel used .brand-gradient, which is blue-to-navy in light but
    // light-blue-to-blue in dark, because its other three call sites are 2px nav
    // indicators where a bright blue is right. As a full-height field that made
    // the one screen every customer crosses the one screen matching neither the
    // navy marketing hero before it nor the navy app after it.
    const signIn = read("app/(auth)/sign-in/page.tsx");
    expect(signIn).toContain("brand-panel");
    expect(signIn).not.toMatch(/brand-gradient/);
    expect(css).toMatch(/\.brand-panel \{[\s\S]*?linear-gradient\(160deg, var\(--ink\), var\(--ink-soft\)\)/);
    // And the panel must not reintroduce a hardcoded text colour: --brand-contrast
    // is near-black in dark mode, which on an ink field is invisible.
    expect(signIn).not.toContain("text-brand-contrast");
  });

  it("never exposes a bare grid ground when the last row is short", () => {
    /**
     * Home renders nine tiles into four columns. The grid drew its hairlines by
     * showing a border-coloured background through 1px gaps, and that ground is
     * only covered where a child sits, so the three empty cells of the last row
     * rendered as one large grey slab under the numbers.
     *
     * The fix has to be structural rather than "add a ninth tile", because the
     * column count changes at every breakpoint, so no fixed child count fills
     * every layout. Cells own their hairlines now and there is no ground to
     * leak.
     */
    const statTile = read("components/ui/StatTile.tsx");
    const grid = statTile.slice(statTile.indexOf("export function StatGrid"));
    expect(grid).not.toContain("bg-border");
    expect(grid).toContain("[&>*]:border-r");
    // The overhang trick only works if the container clips it.
    expect(grid).toContain("-mb-px -mr-px");
    expect(grid).toContain("overflow-hidden");
  });

  it("gives the rotating band every reason to stop moving", () => {
    // An auto-advancing panel is only tolerable if it yields. Missing any one of
    // these is what makes a carousel the most complained-about pattern there is.
    const reel = read("components/home/SignalReel.tsx");
    expect(reel).toContain("prefers-reduced-motion");
    expect(reel).toContain("visibilitychange");
    expect(reel).toMatch(/onMouseEnter/);
    expect(reel).toMatch(/onFocusCapture/);
    // Taking manual control must be permanent, not a temporary reprieve.
    expect(reel).toMatch(/manual \|\|/);
    // Arrow keys, and dots that are real buttons.
    expect(reel).toContain('event.key === "ArrowRight"');
    expect(reel).toContain('type="button"');
  });

  it("defaults to light without consulting the operating system", () => {
    /**
     * Flipped with the green-and-bone palette. The old argument was that money
     * tools are dark; the specific counter-argument is stronger here. The thing
     * being edited is an email, the place it lands is Gmail, and Gmail is light
     * for nearly everyone, so a dark composer makes every preview a guess.
     *
     * What this actually protects is unchanged: the default is decided by us
     * and set before paint, an explicit choice still wins in both directions,
     * and the OS setting never silently overrides a deliberate one.
     */
    const layout = read("app/layout.tsx");
    expect(layout).toContain("t==='dark'?'dark':'light'");
    expect(layout).not.toContain("prefers-color-scheme");
  });
});

describe("premium shared design system", () => {
  it("keeps navigation typography-first across public and app chrome", () => {
    expect(read("components/marketing/Landing.tsx")).toContain(
      "<Wordmark />"
    );
    expect(read("components/Sidebar.tsx")).toContain(
      "<Wordmark />"
    );
    expect(read("app/(dashboard)/layout.tsx")).toContain("<Wordmark />");
  });

  it("maintains practical mobile touch targets", () => {
    expect(read("app/globals.css")).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?min-height: 44px;/
    );
    expect(read("components/MobileNav.tsx")).toContain("min-h-14");
    expect(read("components/MobileNav.tsx")).toContain("min-h-11 min-w-11");
  });

  it("makes account switching and sign-out explicit, accessible, and unclipped", () => {
    const accountMenu = read("components/AccountMenu.tsx");
    const sidebar = read("components/Sidebar.tsx");
    const mobileNav = read("components/MobileNav.tsx");

    expect(accountMenu).toContain("Switch or sign out");
    expect(accountMenu).toContain("account menu. Switch account or sign out.");
    expect(accountMenu).toContain('aria-label="Account actions"');
    expect(accountMenu).toContain("max-h-[calc(100dvh-2rem)]");
    expect(accountMenu).toContain('event.key === "ArrowDown"');
    expect(accountMenu).toContain("text-danger");
    expect(accountMenu).toContain("hover:bg-danger-soft");
    expect(accountMenu).not.toMatch(/text-red-(?:400|600)|hover:bg-red-50/);
    // The account menu belongs to the top bar. In the sidebar footer its
    // popover anchored outside the aside and was clipped by the aside's own
    // overflow rule, so opening it looked like the panel had swallowed the
    // navigation. Guard against it moving back.
    expect(read("app/(dashboard)/layout.tsx")).toContain('placement="bar"');
    expect(sidebar).not.toContain("AccountMenu");
    expect(sidebar).not.toContain("overflow-hidden");
    expect(sidebar).toContain("h-[100dvh]");
    expect(sidebar).toContain("overflow-y-auto overscroll-contain");
    expect(mobileNav).toContain('placement="sheet"');
    expect(mobileNav).toContain("max-h-[92dvh]");
    expect(mobileNav).toContain("document.addEventListener(\"keydown\", onKeyDown)");
    expect(existsSync("components/SignOutButton.tsx")).toBe(false);
  });

  /**
   * The surfaces below were all written without ever being seen rendered: no
   * session, no browser, only the source. That is exactly the condition under
   * which a component drifts off the design system without anyone noticing,
   * and the landing page already proved it happens. These assert the parts of
   * "looks like the rest of the app" that are actually checkable by reading.
   */
  describe("surfaces built without a rendered preview", () => {
    const SURFACES = [
      "components/owner/OwnerConsole.tsx",
      "components/sourcing/SourcingPanel.tsx",
      "components/views/SavedViewBar.tsx",
      "components/settings/WebhooksCard.tsx",
      "components/replies/OutcomeControl.tsx",
    ];

    // A short line is a 32px-or-smaller control with nothing raising it to 44px
    // on a phone. An `sm:` override alongside a base 44px is fine: the rule is
    // about the phone, not about the desktop row.
    const SHORT = /\b(?:min-)?h-(?:6|7|8|9|10)\b/;
    const TALL = /\b(?:min-)?h-11\b/;

    it("has a detector that actually fires", () => {
      // Guards the sweep below from passing because the regex stopped matching.
      expect(SHORT.test('className="min-h-8 rounded-md"')).toBe(true);
      expect(SHORT.test('className="h-8 w-24"')).toBe(true);
      expect(TALL.test('className="min-h-11 px-3"')).toBe(true);
      expect(TALL.test('className="h-11 w-24 sm:h-8"')).toBe(true);
    });

    it("gives every hand-rolled control a 44px target on a phone", () => {
      // The global stylesheet only raises .btn* classes to 44px on mobile, so a
      // control built from raw utilities gets no help and has to say so itself.
      const offenders: string[] = [];
      for (const path of SURFACES) {
        for (const line of read(path).split("\n")) {
          if (!/className=/.test(line)) continue;
          if (/\bbtn-(primary|secondary|ghost|danger)\b/.test(line)) continue;
          if (SHORT.test(line) && !TALL.test(line)) {
            offenders.push(`${path}: ${line.trim().slice(0, 90)}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("stays on semantic tokens rather than raw palette values", () => {
      // Tailwind's own palette does not follow the theme, so a bg-slate-100 is
      // a light-mode-only surface that goes invisible in dark mode.
      for (const path of SURFACES) {
        expect(read(path), path).not.toMatch(
          /\b(?:bg|text|border|ring)-(?:red|green|blue|yellow|amber|emerald|slate|gray|zinc|neutral|indigo|purple|orange)-\d{2,3}\b/
        );
        expect(read(path), path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    });

    it("does not name one surface's nouns in a component shared by two", () => {
      // SavedViewBar is parameterised by surface and the schema already allows
      // CAMPAIGNS, but the reset tab said "All leads" unconditionally. The bug
      // only appears when the second caller lands, which is the change nobody
      // re-reads this file for.
      const bar = read("components/views/SavedViewBar.tsx");
      expect(bar).toContain("RESET_LABELS");
      expect(bar).toContain("All campaigns");
      expect(bar).not.toMatch(/>\s*All leads\s*</);
    });

    it("shows a failed load as failed rather than as a permanent spinner", () => {
      // The operator console caught its own load error, raised a toast, and
      // then sat on "Loading…" forever. A toast is dismissed in four seconds
      // and the page then claims to be working.
      const console_ = read("components/owner/OwnerConsole.tsx");
      expect(console_).toContain("loadFailed");
      expect(console_).toContain("Try again");
    });
  });

  it("uses the shared icon language instead of decorative emoji in core journeys", () => {
    const coreSources = [
      "components/OnboardingWizard.tsx",
      "components/tour/ProductTour.tsx",
      "components/imports/ImportChooser.tsx",
      "components/TestCenter.tsx",
      "components/campaign/CampaignWizard.tsx",
      "components/templates/AiEmailWriter.tsx",
      "components/sequences/AiSequenceWriter.tsx",
      "app/(dashboard)/home/page.tsx",
      "app/(dashboard)/replies/page.tsx",
    ].map(read).join("\n");

    for (const emoji of ["✨", "🔥", "🎉", "👋", "🚀", "✅", "⚠️", "🛡️"]) {
      expect(coreSources).not.toContain(emoji);
    }
  });
});

describe("route transitions", () => {
  // `css` on line 17 is scoped to the describe above, so this block reads it
  // again rather than reaching for a binding it cannot see.
  const css = read("app/globals.css");

  it("animates on a template, which is the only thing that remounts", () => {
    /**
     * The mechanism is the interesting part, and getting it wrong produces a bug
     * that looks exactly like working code.
     *
     * Next preserves a `layout.tsx` across navigations inside its segment, so an
     * entrance animation placed there runs on first load and never again: the
     * app would appear to have a transition until you actually navigated. A
     * `template.tsx` is remounted for every route change, which is what gives
     * the animation something to run on.
     *
     * So this asserts the file is a template, not a layout, and that the class
     * it applies is the one the keyframe targets.
     */
    const template = read("app/(dashboard)/template.tsx");
    expect(template).toContain("route-enter");
    expect(css).toContain("@keyframes route-enter");
    expect(css).toMatch(/\.route-enter \{[\s\S]*?animation: route-enter/);
  });

  it("stays under the threshold where navigation becomes a wait", () => {
    // Dozens of times a session. A transition long enough to notice is a
    // transition long enough to resent.
    const rule = css.slice(css.indexOf(".route-enter {"));
    const duration = Number(rule.match(/animation: route-enter (\d+)ms/)?.[1]);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(300);
  });

  it("gives reduced motion a plain swap rather than a faster one", () => {
    const reduced = css.slice(css.lastIndexOf("(prefers-reduced-motion: reduce)"));
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.route-enter \{ animation: none/);
    expect(reduced.length).toBeGreaterThan(0);
  });
});

/**
 * The type scale, which is the part of the system that did not exist at all.
 *
 * There were no numeric typography tokens anywhere, so every size off
 * Tailwind's default ramp became an arbitrary value. That produced 75 of them
 * across two properties, with the body clustered at 10 to 14px, headings
 * jumping straight to 30 and beyond, and almost nothing between 15 and 30. The
 * missing middle is a large part of why pages read thin, and it is not a thing
 * anyone fixes by tuning one screen: an arbitrary value is invisible to every
 * other screen, so the same decision gets made again from scratch each time.
 *
 * These rules exist so the scale cannot quietly stop being the scale. Each one
 * carries a floor, because a rule that stops matching anything passes forever.
 */
describe("type scale", () => {
  const css = read("app/globals.css");
  const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const themeBlock = css.slice(css.indexOf("@theme inline"));

  const STEPS = [
    "3xs",
    "2xs",
    "xs",
    "sm",
    "base",
    "md",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
  ];

  function sources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx")) out.push(path);
      }
    };
    walk("app");
    walk("components");
    return out;
  }

  const markup = sources().map(read).join("\n");

  it("ascends without a gap it has to be worked around", () => {
    const rem = (step: string): number => {
      const raw = rootBlock.match(new RegExp(`--text-${step}:\\s*([^;]+);`))?.[1];
      if (!raw) throw new Error(`Missing --text-${step}`);
      // The top step is fluid, so read the middle of its clamp.
      const value = raw.startsWith("clamp(")
        ? raw.slice(6).split(",")[2]
        : raw;
      return Number.parseFloat(value);
    };
    const sizes = STEPS.map(rem);
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThan(sizes[index - 1]);
    }
    // The hole the scale was built to close. Two steps have to land strictly
    // between body and the first heading, or the jump comes straight back.
    const body = rem("base");
    const heading = rem("2xl");
    expect(sizes.filter((size) => size > body && size < heading).length)
      .toBeGreaterThanOrEqual(3);
  });

  it("exports every step, so a token without a utility cannot exist", () => {
    for (const step of STEPS) {
      expect(themeBlock).toContain(`--text-${step}: var(--text-${step});`);
    }
    for (const name of ["display", "tight", "base", "label", "caps"]) {
      expect(themeBlock).toContain(`--tracking-${name}: var(--track-`);
    }
    for (const name of ["tight", "snug", "base", "relaxed"]) {
      expect(themeBlock).toContain(`--leading-${name}: var(--lh-${name});`);
    }
  });

  it("sets no size, tracking, or line height outside the scale", () => {
    // Floor first. If the markup stops using the scale, the ban below becomes
    // trivially true and this rule stops meaning anything.
    const onScale = markup.match(
      new RegExp(`\\btext-(?:${STEPS.join("|")})\\b`, "g")
    ) ?? [];
    expect(onScale.length).toBeGreaterThan(600);

    const arbitrary = markup.match(/\b(?:text|tracking|leading)-\[[^\]]+\]/g) ?? [];
    expect(arbitrary).toEqual([]);
  });

  it("does not reach for a weight the scale does not define", () => {
    // 660, 680, 730, 740 and 780 all shipped at once, which is five weights
    // nobody chose on purpose and a variable font will happily render.
    expect(markup.match(/font-\[\d+\]/g) ?? []).toEqual([]);
    const weights = markup.match(/font-(?:normal|medium|semibold|bold)\b/g) ?? [];
    expect(weights.length).toBeGreaterThan(200);
  });
});

/**
 * The radius ladder, and specifically whether anything uses it.
 *
 * The ladder itself was fine. Adoption was not: 182 call sites sat on
 * `rounded-xl` against 109 on `rounded-lg` and 7 on `rounded-md`, which is not
 * a ladder, it is one value with two exceptions. A 236px panel and a 44px
 * button shared a corner, so neither one said anything about its own weight,
 * and twenty-four more elements were on a bare `rounded` that is 4px and not on
 * the ladder at all.
 *
 * The fix was to decide the rung from what the element is rather than from how
 * it looked on the screen being built, because the second one gets re-decided
 * every time and drifts. These rules hold that.
 */
describe("radius by element class", () => {
  function tsxSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx")) out.push(path);
      }
    };
    walk("app");
    walk("components");
    return out;
  }

  const files = tsxSources();
  /**
   * Comments stripped, because these rules are about what the markup renders.
   * The bare-`rounded` check below matched the word "rounded" inside a comment
   * describing a rounded container, which is the third time in this codebase a
   * guard has been broken by the prose explaining the thing it guards. A rule
   * has to survive being written about.
   */
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "");
  const markup = files.map((file) => withoutComments(read(file))).join("\n");
  const css = read("app/globals.css");

  it("keeps every rung of the ladder in service", () => {
    const count = (rung: string) =>
      (markup.match(new RegExp(`\\brounded-${rung}\\b`, "g")) ?? []).length;

    /**
     * The old distribution was 182 uses on one rung, 109 on another, and 7 and
     * 2 on the two below. A rung in single digits is proof nobody was choosing
     * a rung at all, which is the state this rule exists to prevent returning.
     *
     * The control rung is checked differently on purpose, and the difference is
     * an improvement rather than a loophole. Seventy-five controls used to carry
     * `rounded-md` because they carried a whole border recipe by hand; the base
     * rule owns that now, so the decision is made once in CSS instead of
     * seventy-five times in markup. Counting utilities would read that as the
     * control rung falling out of use, when what actually happened is that it
     * stopped needing to be repeated.
     */
    for (const rung of ["sm", "lg", "full"]) {
      expect(count(rung), `rounded-${rung} in service`).toBeGreaterThanOrEqual(10);
    }
    // Buttons and icon tiles still opt in explicitly.
    expect(count("md")).toBeGreaterThanOrEqual(10);
    // Text-like form controls get it from one place.
    expect(css).toMatch(
      /@layer base \{[\s\S]*?textarea \{[\s\S]*?border-radius: var\(--radius-md\);/
    );

    const total =
      ["sm", "md", "lg", "full", "2xl"].reduce((sum, rung) => sum + count(rung), 0);
    expect(total).toBeGreaterThan(300);
  });

  it("holds the 20px rung in reserve, since it is the one everything reached for", () => {
    expect(markup.match(/\brounded-xl\b/g) ?? []).toEqual([]);
  });

  it("never sets a corner off the ladder", () => {
    // Bare `rounded` is Tailwind's 4px and is not a rung.
    const bare = markup.match(/\brounded(?![-\w[])/g) ?? [];
    expect(bare).toEqual([]);

    // One exemption, and it is a mark rather than an object: a 12px heatmap
    // cell, where the smallest rung would round half the square away.
    const arbitrary = files.flatMap((file) => {
      if (file.endsWith("components/analytics/Charts.tsx")) return [];
      return withoutComments(read(file)).match(/\brounded-\[[^\]]+\]/g) ?? [];
    });
    expect(arbitrary).toEqual([]);
  });

  it("keeps 28px for things that sit above the page, not for panels on it", () => {
    // A dialog, a popover or a full-page hero surface. Anything else at this
    // radius is a panel that drifted up a rung.
    const large = files.filter((file) =>
      /\brounded-2xl\b/.test(withoutComments(read(file)))
    );
    expect(large.length).toBeGreaterThan(0);
    expect(large.length).toBeLessThanOrEqual(8);
  });

  it("gives the formatting toolbar a real target instead of nine copies of one string", () => {
    const css = read("app/globals.css");
    expect(css).toContain(".editor-tool");
    expect(css).toMatch(/\.editor-tool \{[\s\S]*?min-height: 36px;/);
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{\s*\.editor-tool \{ min-height: 44px;/
    );
    const editor = read("components/templates/TemplateEditor.tsx");
    expect((editor.match(/editor-tool/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});

/**
 * Two things that only fail in the browser, silently.
 *
 * Tailwind v3 let `duration-[--dur-fast]` mean the variable. v4 does not: it
 * emits `transition-duration: --dur-fast`, which is not a value, so the
 * declaration is dropped and the element falls back to the default duration.
 * Nothing errors. Four of these were found and fixed in an earlier pass and
 * fourteen more were still shipping, including the one on every table row in
 * the product, so the pattern clearly comes back on its own.
 */
describe("syntax that compiles to nothing", () => {
  function allSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:tsx|css)$/.test(entry.name)) out.push(path);
      }
    };
    walk("app");
    walk("components");
    return out;
  }

  it("never uses the v3 bracket form for a custom property", () => {
    const offenders = allSources().filter((file) => /-\[--[\w-]+\]/.test(read(file)));
    expect(offenders).toEqual([]);

    // Floor: the v4 form has to actually be in use, or this bans a pattern
    // nobody was reaching for and would keep passing after the utilities left.
    const markup = allSources().map(read).join("\n");
    expect((markup.match(/-\(--[\w-]+\)/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it("styles form controls once, in a layer a call site can still beat", () => {
    /**
     * Sixty-six controls spelled out the same six utilities: a radius, a
     * hairline, a surface, a type size, and a focus pair that duplicated the
     * :focus-visible rule already in the file. Four of them drew a second,
     * greyer ring on top of the first.
     *
     * The layer is the part that has to hold. Unlayered, this rule would win
     * against every utility, including the search field with its own left
     * padding for the icon and the API-key field set in mono. In @layer base it
     * is a default rather than a mandate, which is the difference between a
     * system and a straitjacket.
     */
    const css = read("app/globals.css");
    const base = css.slice(css.indexOf("@layer base {", css.indexOf("── Form controls")));
    const block = base.slice(0, base.indexOf("\n}"));
    expect(block).toContain("textarea");
    for (const declaration of [
      "border: 1px solid var(--border);",
      "border-radius: var(--radius-md);",
      "background: var(--surface);",
      "font-size: var(--text-sm);",
    ]) {
      expect(block, declaration).toContain(declaration);
    }
    // Checkboxes and radios keep the native control.
    expect(block).toContain(':not([type="checkbox"])');

    const markup = allSources()
      .filter((file) => file.endsWith(".tsx"))
      .map(read)
      .join("\n");
    // The recipe, checked on the elements it belongs to rather than as a bare
    // substring: the same tokens are correct on a chart tooltip, which is a
    // panel that happens to be small.
    // The tag cannot be matched with `[^>]*`, because a JSX attribute routinely
    // contains a `>` of its own inside an arrow function and that ends the match
    // before className is reached. Take the text after the tag up to whatever
    // opens next instead.
    const controls = [...markup.matchAll(/<(?:input|select|textarea)\b/g)]
      .map((match) => {
        const rest = markup.slice(match.index! + match[0].length);
        const attributes = rest.slice(0, rest.search(/<[a-zA-Z]/));
        return attributes.match(/className="([^"]*)"/)?.[1] ?? null;
      })
      .filter((cls): cls is string => cls !== null);
    const respelt = controls.filter((cls) =>
      /\bborder border-border\b/.test(cls) || /\brounded-md\b/.test(cls)
    );
    expect(respelt, "controls respelling what the base rule owns").toEqual([]);
    // And the focus pair that drew a second ring over the global one.
    expect(markup).not.toContain("focus:ring-2 focus:ring-border");
    // Floor: controls still exist, so this is banning a live pattern.
    expect(controls.length).toBeGreaterThan(50);
  });

  it("owns the inline link instead of respelling it forty-one times", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.link \{[\s\S]*?text-decoration-color: var\(--border\);/);
    expect(css).toContain(".link:hover { text-decoration-color: currentColor; }");
    const markup = allSources()
      .filter((file) => file.endsWith(".tsx"))
      .map(read)
      .join("\n");
    expect(markup).not.toContain("decoration-border");
    expect((markup.match(/\blink\b/g) ?? []).length).toBeGreaterThan(30);
  });
});

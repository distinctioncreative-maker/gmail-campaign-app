import { existsSync, readFileSync } from "node:fs";
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
    for (const selector of [".btn,", ".segmented {", ".seg-btn {", ".field-input {"]) {
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

  it("defaults to dark without consulting the operating system", () => {
    // Dark first is a brand decision. An explicit choice still wins both ways,
    // which is the part that matters for anyone who wants light.
    const layout = read("app/layout.tsx");
    expect(layout).toContain("t==='light'?'light':'dark'");
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

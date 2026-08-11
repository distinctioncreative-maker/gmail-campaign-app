import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

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

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

describe("landing-page experience", () => {
  it("uses a calm typographic wordmark in the public navigation", () => {
    const navigation = landingSource.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navigation).toContain('<Wordmark descriptor="Outreach OS" />');
    expect(navigation).not.toContain("<LogoMark");
  });

  it("keeps the top-right pilot action readable above the global link rule", () => {
    // The colour now comes from the shared brand token rather than a literal,
    // so this asserts the intent (dark ink on the light pill) and checks the
    // resolved --foreground value for contrast.
    expect(landingStyles).toMatch(
      /\.root \.navPilot \{[\s\S]*?color: var\(--landing-copy\);/
    );
    expect(
      contrastRatio(
        tokenHex("marketing-copy"),
        tokenHex("marketing-surface-2")
      )
    ).toBeGreaterThanOrEqual(4.5);
    expect(landingSource).toContain("Request a pilot <Arrow />");
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
    expect(landingSource).toContain("Gmail outreach with deliberate control");
    expect(landingSource).toContain("Built for deliverability");
    expect(landingSource).not.toContain("keeps them out of spam");
    expect(landingSource).not.toContain("Outreach that lands in the inbox");
  });

  it("uses only the semantic warm palette and keeps text pairs at AA contrast", () => {
    expect(landingStyles.match(/#[0-9a-fA-F]{3,8}/g) ?? []).toHaveLength(0);

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

  it("centers and focuses the pilot email field from every shared CTA", () => {
    expect(landingSource).toContain("function PilotLink");
    expect(landingSource).toContain('block: "center"');
    expect(landingSource).toContain('"scrollend"');
    expect(landingSource).toContain("fallback = window.setTimeout");
    expect(landingSource).toContain("input.focus()");
    expect(landingSource).toContain("aria-controls={PILOT_EMAIL_ID}");
    expect(landingSource.match(/<PilotLink/g)?.length).toBeGreaterThanOrEqual(3);
    expect(landingStyles).toMatch(
      /\.pilotAnchor \{[\s\S]*?scroll-margin-top: 96px;/
    );
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
    expect(landingSource).toContain(
      "Your list is worth more than you are getting from it."
    );
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
      /@media \(max-width: 720px\) \{[\s\S]*?\.root \.navPilot \{[\s\S]*?min-height: 44px;/
    );
  });
});

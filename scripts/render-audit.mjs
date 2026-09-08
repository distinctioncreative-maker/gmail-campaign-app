/**
 * What the page actually renders, measured.
 *
 * Every visual guard in tests/unit reads source. That catches a rule that was
 * never written and a token that resolves to nothing, and it is blind to the
 * whole class of defect where every rule is present, every name resolves, and
 * the page is still wrong. Six of those shipped in this redesign:
 *
 *   - the marketing page had no wordmark below 520px, in the nav and the footer,
 *     because a rule meant to hide an optional descriptor used `span:last-child`
 *     and matched the name itself
 *   - a reduced-motion opt-out sat above the rule it cancelled, so it lost on
 *     source order and every dialog and toast still animated for someone who
 *     had asked for stillness
 *   - a section reserved half its width for a child deleted months earlier
 *   - a chart line's last third rendered in the one colour its legend did not name
 *   - a marker filled with a background token crawled the data as a black hole
 *   - a footer link pointed at an id nothing had carried since
 *
 * Not one was visible in a diff. All six were obvious within a second of
 * looking at the page. So this looks at the page.
 *
 * Usage:
 *   npm run build && npm run start &      # or PORT=3100 npm run start
 *   node scripts/render-audit.mjs [--base http://localhost:3000] [--shots DIR]
 *
 * Exits non-zero if any check fails, so it can gate a release.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg("base", process.env.AUDIT_BASE ?? "http://localhost:3100");
const SHOTS = arg("shots", null);
/** The pre-installed browser. Playwright's own download is skipped in CI. */
const EXECUTABLE =
  process.env.AUDIT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** `/demo` renders the real product components against fixtures, with no auth. */
const ROUTES = ["/", "/demo", "/demo/campaigns", "/demo/replies", "/demo/leads", "/demo/reports"];
const WIDTHS = [1440, 390];
const THEMES = ["dark", "light"];

/**
 * Minimum target size, by what is pointing at it.
 *
 * 44px is the touch figure, and the app already holds it for its own mobile
 * navigation. Applying it to a desktop page with a mouse reports every inline
 * text link in the footer, which is not a defect and buries the ones that are.
 * On a fine pointer the standard is WCAG 2.5.8's 24px.
 */
const TARGET_TOUCH = 44;
const TARGET_POINTER = 24;

const failures = [];
const note = (route, width, theme, message) =>
  failures.push(`${route} @${width} ${theme}: ${message}`);

/** Runs inside the page. Returns plain data only. */
function collect(minTarget) {
  const de = document.documentElement;

  const rect = (el) => el.getBoundingClientRect();
  const describe = (el) =>
    `<${el.tagName.toLowerCase()}${
      el.className && typeof el.className === "string"
        ? ` class="${el.className.split("__").pop().slice(0, 30)}"`
        : ""
    }>`;

  /**
   * Only the outermost offender. A wide table makes every cell inside it
   * overflow too, and reporting thirty cells buries the one element that
   * actually needs a fix.
   */
  const escapes = (el) => {
    const r = rect(el);
    return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
  };
  const overflow = [];
  /**
   * Only when the document actually scrolls sideways.
   *
   * A decorative background deliberately drawn wider than its container and
   * clipped by it extends past the viewport on paper and is invisible in
   * practice. Gating on the page genuinely scrolling is the difference between
   * reporting a layout bug and reporting a design that used overflow: hidden.
   */
  if (de.scrollWidth > de.clientWidth + 1) {
    for (const el of document.querySelectorAll("body *")) {
      if (!escapes(el)) continue;
      if (el.parentElement && escapes(el.parentElement)) continue;
      const r = rect(el);
      overflow.push(`${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
  }

  const small = [];
  for (const el of document.querySelectorAll("a[href], button:not([disabled])")) {
    const r = rect(el);
    if (r.width === 0 || r.height === 0) continue;
    /**
     * A bare text link is as wide as its word. "Trust" cannot be 44px wide
     * without padding that would break the row it sits in, and WCAG 2.5.8
     * exempts inline targets for that reason; what decides whether a thumb
     * lands on it is its height. Something drawn as a button or a tile chose
     * its own box, so both dimensions are fair.
     *
     * Told apart by whether it paints anything: a background or a border means
     * a deliberate box. `display` cannot be used for this, because a flex row
     * blockifies its children, so every link in the footer reports as a block.
     */
    /**
     * WCAG 2.5.8 exempts a target "in a sentence or block of text", and it is
     * the one exemption that is real rather than convenient: a campaign name
     * linked mid-paragraph cannot be given 24px of height without opening up
     * the line spacing around it, and the sentence is the affordance.
     *
     * Detected by asking whether the parent says anything besides this link.
     */
    const parent = el.parentElement;
    if (parent) {
      const around = (parent.textContent || "").replace(el.textContent || "", "").trim();
      if (around.length > 0 && getComputedStyle(el).display.startsWith("inline")) continue;
    }

    const cs = getComputedStyle(el);
    const paints =
      (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
      parseFloat(cs.borderTopWidth) > 0 ||
      cs.backgroundImage !== "none";
    const tooSmall = paints
      ? r.height < minTarget || r.width < minTarget
      : r.height < minTarget;
    if (!tooSmall) continue;
    const label = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 28);
    small.push(`${Math.round(r.width)}x${Math.round(r.height)} ${JSON.stringify(label)}`);
  }

  /**
   * Text styled out of existence while the thing around it still renders.
   *
   * The parent check is what makes this signal rather than noise. A label
   * inside a sidebar that is `display: none` at this width is not a bug, it is
   * a responsive layout; there are dozens of those on every page. A label that
   * vanishes while its own parent is on screen is the wordmark bug, where the
   * nav rendered fine and the name inside it collapsed to nothing.
   */
  const NON_VISUAL = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD"]);
  const invisible = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    if (NON_VISUAL.has(el.tagName)) continue;
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const r = rect(el);
    if (r.width > 0 && r.height > 0) continue;
    const cs = getComputedStyle(el);
    // sr-only text is deliberately clipped to a pixel and must not be reported.
    // Tailwind v4 clips with clip-path rather than the legacy clip property, so
    // checking only `clip` reports every screen-reader label in the app.
    if (cs.position === "absolute" && (cs.clip !== "auto" || cs.clipPath !== "none")) continue;
    if (el.closest("[hidden]")) continue;
    // An element that declares its own responsive visibility meant it. This is
    // Tailwind's explicit API for the thing, and it is not the bug: the bug is
    // an element hidden by a rule written somewhere else entirely.
    if (/(^|\s)(hidden|(sm|md|lg|xl):(inline|block|flex|hidden|inline-flex|inline-block|grid))(\s|$)/.test(
        typeof el.className === "string" ? el.className : ""
      )) continue;
    // A module stylesheet hiding something at a breakpoint says so in the
    // markup. The attribute exists because the alternative is exempting every
    // media-query hide, and a media-query hide is exactly what removed the
    // wordmark from the marketing page for months. Declaring it puts the intent
    // where the next reader is looking.
    if (el.closest("[data-responsive-hidden]")) continue;
    // The parent must be on screen. Otherwise this is a hidden section, not a
    // hidden element.
    const parent = el.parentElement;
    if (!parent) continue;
    const pr = rect(parent);
    if (pr.width === 0 || pr.height === 0) continue;
    invisible.push(`${describe(el)} ${JSON.stringify(text.slice(0, 30))} inside a visible ${describe(parent)}`);
  }

  const deadAnchors = [];
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute("href").slice(1);
    if (id && !document.getElementById(id)) {
      deadAnchors.push(`${JSON.stringify((a.innerText || "").trim().slice(0, 24))} -> #${id}`);
    }
  }

  const animating = new Set();
  for (const el of document.querySelectorAll("*")) {
    const name = getComputedStyle(el).animationName;
    if (name && name !== "none") name.split(",").forEach((n) => animating.add(n.trim()));
  }

  /**
   * An empty grid track: the shape of a layout still reserving room for a child
   * that was deleted. Only reported when a track is wide and nothing overlaps
   * it, which is what "half the section is blank" looks like from here.
   */
  const emptyTracks = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display !== "grid") continue;
    const cols = cs.gridTemplateColumns.split(" ").map(Number).filter((n) => !Number.isNaN(n));
    if (cols.length < 2) continue;
    const kids = [...el.children].filter((c) => rect(c).width > 0);
    if (kids.length >= cols.length) continue;
    const widest = Math.max(...cols);
    if (widest < 200) continue;
    emptyTracks.push(
      `${describe(el)} has ${cols.length} columns and ${kids.length} visible children (widest track ${Math.round(widest)}px)`
    );
  }

  return {
    overflow,
    small,
    invisible,
    deadAnchors,
    animating: [...animating].sort(),
    emptyTracks,
    height: document.body.scrollHeight,
  };
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const touch = width < 500;
      const context = await browser.newContext({
        viewport: { width, height: touch ? 844 : 1000 },
        deviceScaleFactor: 2,
        reducedMotion: "no-preference",
        hasTouch: touch,
        isMobile: touch,
      });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("massleader.theme", t);
        } catch {
          /* private mode */
        }
      }, theme);
      const page = await context.newPage();
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      // Settle scroll-triggered reveals so nothing is measured mid-transition.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(600);

      const minTarget = touch ? TARGET_TOUCH : TARGET_POINTER;
      const r = await page.evaluate(collect, minTarget);
      if (SHOTS) {
        await page.screenshot({
          path: `${SHOTS}/${route.replace(/\//g, "_") || "_root"}-${width}-${theme}.png`,
          fullPage: true,
        });
      }

      for (const o of r.overflow) note(route, width, theme, `overflows the viewport: ${o}`);
      for (const s of r.small) note(route, width, theme, `target under ${minTarget}px: ${s}`);
      for (const i of r.invisible) note(route, width, theme, `text renders at zero size: ${i}`);
      for (const a of r.deadAnchors) note(route, width, theme, `anchor points at nothing: ${a}`);
      for (const g of r.emptyTracks) note(route, width, theme, `grid track with no child: ${g}`);

      await context.close();
    }
  }
}

/**
 * Reduced motion is checked once per route rather than per breakpoint: the
 * preference does not vary with viewport, and one pass is enough to catch an
 * opt-out that lost on source order.
 */
for (const route of ROUTES) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const running = await page.evaluate(() => {
    const names = new Set();
    for (const el of document.querySelectorAll("*")) {
      const n = getComputedStyle(el).animationName;
      if (n && n !== "none") n.split(",").forEach((x) => names.add(x.trim()));
    }
    return [...names];
  });
  if (running.length > 0) {
    note(route, 1440, "reduce", `still animating: ${running.join(", ")}`);
  }
  await context.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\nrender audit: ${failures.length} finding(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`render audit: clean across ${ROUTES.length} routes, ${WIDTHS.length} widths, ${THEMES.length} themes`);

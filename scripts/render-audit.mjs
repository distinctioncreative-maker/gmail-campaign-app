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
import { existsSync, mkdirSync } from "node:fs";

import { readCookie } from "./audit/cookie.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg("base", process.env.AUDIT_BASE ?? "http://localhost:3100");
const SHOTS = arg("shots", null);
/**
 * A `__session` cookie, so the signed-in screens can be measured too.
 *
 * Read from the command line or the environment and never written anywhere:
 * it is a live credential that signs the holder in as that account until it
 * expires. Without it the audit runs the public routes only, which is the
 * right default.
 */
const COOKIE = (() => {
  try {
    return readCookie(arg("cookie", process.env.AUDIT_COOKIE ?? null)).value;
  } catch (error) {
    console.error(`render audit: ${error.message}`);
    process.exit(1);
  }
})();
/**
 * Which Chromium to drive.
 *
 * `AUDIT_CHROMIUM` wins. Failing that, a pre-installed browser is used if it is
 * actually there, and otherwise this falls through to Playwright's own
 * resolution so `npx playwright-core install chromium` is all a fresh machine
 * needs. Hard-coding the path meant the script only ran where it was written,
 * which is a poor property for the one tool that is supposed to tell you what
 * your users see.
 */
const PREINSTALLED = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXECUTABLE =
  process.env.AUDIT_CHROMIUM ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

/** `/demo` renders the real product components against fixtures, with no auth. */
/**
 * Everything reachable without signing in: the marketing page, the live demo,
 * the legal and support pages, and the 404. The last group is the quiet half —
 * nobody redesigns a privacy policy, so nobody looks at one, and it is exactly
 * where a wall of unbroken 13px text or an overflowing table survives for
 * months. The 404 is reached by asking for a path that does not exist.
 */
const PUBLIC_ROUTES = [
  "/",
  "/demo",
  "/demo/campaigns",
  "/demo/replies",
  "/demo/leads",
  "/demo/reports",
  "/privacy",
  "/terms",
  "/compliance",
  "/acceptable-use",
  "/support",
  "/no-such-page",
];

/**
 * The screens behind a login. Only visited when a session cookie is supplied,
 * because without one every single request redirects to the marketing page and
 * the audit reports on the same page thirteen times.
 */
const AUTH_ROUTES = [
  "/home",
  "/campaigns",
  "/replies",
  "/leads",
  "/reports",
  "/templates",
  "/sequences",
  "/suppressions",
  "/settings",
  "/team",
  "/deliverability",
  "/help",
];

const ROUTES = COOKIE ? [...PUBLIC_ROUTES, ...AUTH_ROUTES] : PUBLIC_ROUTES;
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
  /**
   * An element inside its own scroll container is not what pushed the page
   * sideways. A wide table in an `overflow-x: auto` div still reports a
   * bounding box a thousand pixels across — that is the box, not the picture —
   * and blaming it points the fix at the one place already doing the right
   * thing. Ask instead whether anything between here and the body clips.
   */
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };
  if (de.scrollWidth > de.clientWidth + 1) {
    for (const el of document.querySelectorAll("body *")) {
      if (!escapes(el)) continue;
      if (clipped(el)) continue;
      if (el.parentElement && escapes(el.parentElement) && !clipped(el.parentElement)) continue;
      const r = rect(el);
      overflow.push(`${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    /**
     * The page scrolls and nothing owns it. Better to say so than to report
     * clean: the reader can then look, and the tool has not lied.
     */
    if (overflow.length === 0) {
      overflow.push(
        `the page scrolls sideways (${de.scrollWidth}px of document in ${de.clientWidth}px)` +
          ` but every element that escapes sits inside a scroll container`
      );
    }
  }

  const small = [];
  /**
   * Every operable box on the page, which is more than the set that gets
   * reported: the spacing rule below has to judge a link against the select
   * next to it, not only against other links.
   */
  const targets = [];
  for (const el of document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"]'
  )) {
    const r = rect(el);
    if (r.width > 0 && r.height > 0) targets.push({ el, r });
  }

  const undersized = [];
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
    undersized.push({ el, r });
  }

  /**
   * WCAG 2.5.8's spacing exception, which is the whole difference between a
   * report you can act on and a wall of noise.
   *
   * An undersized target passes if a 24px circle centred on it does not reach
   * another target's circle. This is exactly the case of a table: a lead name
   * is 16px of text, and no padding will make it taller without turning the
   * table into a list, but the row below it is forty-odd pixels away and no
   * thumb is going to confuse the two. Without this rule every name in a
   * three-hundred-row table is a finding, which drowns the two dots on Home
   * that genuinely could not be pressed.
   *
   * The circle is the spec's 24px at both widths. The size threshold above
   * still rises to 44 on a phone — that part is about whether a fingertip
   * covers the target — but how far apart two things must be to be told apart
   * is a property of the hand, not of the viewport.
   */
  const SPACING = 24;
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  for (const { el, r } of undersized) {
    const c = centre(r);
    const crowded = targets.some(({ el: other, r: otherRect }) => {
      if (other === el || el.contains(other) || other.contains(el)) return false;
      const o = centre(otherRect);
      return Math.hypot(c.x - o.x, c.y - o.y) < SPACING;
    });
    if (!crowded) continue;
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
  // OPTION and OPTGROUP have no box at all while the select is closed, which is
// every screenshot ever taken of a page. Reporting them said "your select is
// broken" about sixty times across the app and was wrong every time.
const NON_VISUAL = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD", "OPTION", "OPTGROUP",
  ]);
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

  /**
   * Contrast, measured on the rendered pixel rather than on a pair of tokens.
   *
   * The token guards in tests/unit check the pairs someone thought to write
   * down. They cannot see text that inherits a colour from three ancestors up,
   * or sits on a translucent overlay, or lands on a surface the author did not
   * have in mind. This walks up for the first opaque background and computes
   * the ratio actually on screen.
   *
   * Thresholds are WCAG AA: 4.5:1, or 3:1 for large text, which is 24px and up,
   * or 18.66px and up when bold.
   */
  const srgb = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  /**
   * Chrome serialises a computed background as `color(srgb r g b / a)` whenever
   * the author wrote a wide-gamut or color-mix() value, and as `rgb()`
   * otherwise. Parsing only the second means the first reads as "no background"
   * and the walk carries on past it. That is not a small error: the marketing
   * nav is a color-mix, so skipping it took the backdrop all the way up to the
   * light page ground and reported the white wordmark on the dark bar at
   * 1.04:1.
   */
  const parse = (value) => {
    const v = value || "";
    const modern = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(v);
    if (modern) {
      return {
        r: parseFloat(modern[1]) * 255,
        g: parseFloat(modern[2]) * 255,
        b: parseFloat(modern[3]) * 255,
        a: modern[4] === undefined ? 1 : parseFloat(modern[4]),
      };
    }
    const legacy = /rgba?\(([^)]+)\)/.exec(v);
    if (!legacy) return null;
    const [r, g, b, a = "1"] = legacy[1].split(",").map((x) => parseFloat(x));
    return { r, g, b, a };
  };
  const luminance = ({ r, g, b }) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  /**
   * The first opaque background above this element, or null when it cannot be
   * known.
   *
   * Null happens when something on the way up paints a gradient or an image:
   * the colour behind the text is then a different value at every pixel and no
   * amount of walking the tree will produce it. Reporting a guess there is
   * worse than reporting nothing, because it is wrong in the loud direction.
   * The first version of this returned white as a fallback and duly announced
   * that the white hero headline had 1.04:1 against the dark band behind it.
   */
  function backdrop(el) {
    let node = el;
    let acc = null;
    while (node && node !== document.documentElement.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (c.a >= 1) return { ...acc, a: 1 };
      }
      node = node.parentElement;
    }
    return acc && acc.a >= 1 ? acc : null;
  }

  const contrast = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const r = rect(el);
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
    // sr-only
    if (cs.position === "absolute" && (cs.clip !== "auto" || cs.clipPath !== "none")) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = backdrop(el);
    if (!bg) continue;
    const flat = fg.a < 1 ? over(fg, bg) : fg;
    const [hi, lo] = [luminance(flat), luminance(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio + 0.01 >= need) continue;

    const key = `${cs.color}|${cs.fontSize}|${text.slice(0, 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contrast.push(
      `${ratio.toFixed(2)}:1 (needs ${need}) ${describe(el)} ${JSON.stringify(text.slice(0, 30))}`
    );
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
    contrast,
    deadAnchors,
    animating: [...animating].sort(),
    emptyTracks,
    height: document.body.scrollHeight,
  };
}

/** httpOnly and secure, matching how the app sets it in app/api/auth/session. */
async function addSession(context) {
  await context.addCookies([
    {
      name: "__session",
      value: COOKIE,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      secure: new URL(BASE).protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
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
      /**
       * The public pages are visited as the public sees them, cookie or not.
       *
       * Signed in, `/` is not the marketing page: the app sends you to /home,
       * which is correct behaviour and which the redirect check would otherwise
       * report as a broken route four times. Measuring the marketing page while
       * holding a session would also be measuring a page no visitor ever gets.
       */
      if (COOKIE && !PUBLIC_ROUTES.includes(route)) await addSession(context);
      const page = await context.newPage();
      await page.goto(BASE + route, { waitUntil: "networkidle" });

      /**
       * Did we actually land on the page we asked for?
       *
       * An expired or wrong session cookie does not error: every guarded route
       * quietly redirects to the marketing page, the audit measures that page
       * twelve times, finds nothing wrong with it, and reports "clean across 18
       * routes (signed in)". That is the worst possible output, because it is
       * indistinguishable from success and it is what you get precisely when
       * the credential you are relying on has stopped working.
       */
      const landed = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
      const asked = route.replace(/\/$/, "") || "/";
      if (landed !== asked) {
        note(route, width, theme, `redirected to ${landed} — not signed in, or the route moved`);
        await context.close();
        continue;
      }

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
      for (const c of r.contrast) note(route, width, theme, `below AA contrast: ${c}`);
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
  if (COOKIE && !PUBLIC_ROUTES.includes(route)) await addSession(context);
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
console.log(
  `render audit: clean across ${ROUTES.length} routes` +
    `${COOKIE ? " (signed in)" : " (public only)"}` +
    `, ${WIDTHS.length} widths, ${THEMES.length} themes`
);

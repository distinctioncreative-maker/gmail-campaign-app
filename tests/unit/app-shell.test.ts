import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
/** Source with comments stripped, because these rules are about what renders. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path)) out.push(path);
  }
  return out;
}

const css = code(read("app/globals.css"));

/**
 * The workspace name has one home.
 *
 * It had three, all above the fold on /home: under the wordmark in the sidebar
 * at 11px muted, in the top bar at 14px medium foreground, and again inside the
 * greeting pill. One string, three type treatments, none of them agreeing,
 * which is a large part of why the chrome read as assembled rather than
 * designed. The breadcrumb is where it lives now.
 */
describe("the workspace name is rendered once", () => {
  const renderers = [...walk("app"), ...walk("components")].filter((path) => {
    const source = code(read(path));
    // A component that RENDERS the name, as opposed to one that passes it on
    // as a prop or binds it to an input. The distinction is the character
    // before the brace: `workspaceName={workspaceName}` and
    // `value={workspaceName}` are plumbing, `>{workspaceName}` is a rendering.
    // The trailing lookahead drops object-literal keys, so a request body
    // built as `JSON.stringify({ workspaceName: ... })` is not mistaken for a
    // second place the name appears on screen.
    return /[^=]\{\s*(workspaceName|orgName)\b(?!\s*:)/.test(source);
  });

  it("has exactly one component that renders it", () => {
    expect(renderers).toEqual(["components/ui/Breadcrumb.tsx"]);
  });

  it("still actually renders it there", () => {
    // Non-vacuity: deleting the name from the product entirely would satisfy
    // the rule above.
    const breadcrumb = code(read("components/ui/Breadcrumb.tsx"));
    expect(breadcrumb).toContain("{workspaceName || \"Workspace\"}");
    expect(code(read("app/(dashboard)/layout.tsx"))).toMatch(
      /<Breadcrumb\s+workspaceName=\{workspaceName\}/
    );
  });

  it("does not repeat the page's own heading in the trail", () => {
    // The trail stops at the section on purpose. Naming the record here would
    // put the string beside an h1 that already says it, in 13px, which is the
    // fourth copy this component exists to prevent.
    const breadcrumb = code(read("components/ui/Breadcrumb.tsx"));
    expect(breadcrumb).toContain("current.label");
    expect(breadcrumb).not.toMatch(/entityName|recordName|title\b/);
  });
});

/**
 * The rail's collapsed state is CSS, not React state.
 *
 * Held in state, the server renders an expanded rail and the client corrects it
 * after mount, so everyone who collapsed it watches it collapse again on every
 * navigation. Read from localStorage during render instead and it is a
 * hydration mismatch on every page, because the server has no localStorage.
 * The attribute is set before paint by the same script that sets the theme.
 */
describe("the navigation rail", () => {
  const sidebar = code(read("components/Sidebar.tsx"));

  it("keeps no collapsed state in React", () => {
    // Stated as "this file holds no state at all" rather than as "no state
    // whose name contains collapsed". The narrower version reads the
    // declaration in one direction only and misses
    // `const [collapsed, setCollapsed] = useState(false)`, where the name comes
    // first. This file's whole design is that CSS owns the state, so the broad
    // rule is the accurate one.
    expect(sidebar).not.toMatch(/\buseState\b/);
    expect(sidebar).not.toMatch(/\buseEffect\b/);
  });

  it("is set before paint, alongside the theme", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("massleader.rail");
    expect(layout).toMatch(/dangerouslySetInnerHTML[\s\S]{0,600}massleader\.rail/);
    // In the same script as the theme, not a second one: two pre-paint scripts
    // is two chances to forget one.
    expect((layout.match(/dangerouslySetInnerHTML/g) ?? []).length).toBe(1);
  });

  it("has both widths in CSS and the brief's two values", () => {
    expect(css).toMatch(/\.rail \{[^}]*width: 15rem/);
    expect(css).toMatch(/\[data-rail="collapsed"\] \.rail \{[^}]*width: 4\.5rem/);
  });

  it("keeps every label reachable when the labels are hidden", () => {
    // A collapsed rail is icons to the eye and never to a screen reader.
    expect(sidebar).toContain('className="rail-sr-label sr-only"');
    expect(css).toMatch(/\[data-rail="collapsed"\] \.rail-sr-label \{ display: revert/);
    expect(css).toMatch(/\.rail-sr-label \{ display: none/);
  });

  it("centres the icons in the rail rather than in the nav's padding box", () => {
    // Measured at 34 against a rail centre of 36 before this rule existed. Two
    // pixels is invisible on one icon and obvious down a column of five.
    expect(css).toMatch(/\[data-rail="collapsed"\] \.rail nav \{ padding-right: 0/);
  });

  it("does not draw a group divider above the first group", () => {
    // A divider there separates the first item from the wordmark, which the
    // head's own border already does. `:first-child` cannot express it: each
    // item sits in its own `contents` wrapper.
    expect(sidebar).toMatch(/\{i > 0 && \(\s*<hr[^>]*rail-rule/);
  });
});

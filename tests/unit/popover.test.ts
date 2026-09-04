import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const popover = readFileSync("components/ui/Popover.tsx", "utf8");

/** Source with comments stripped, because these rules are about what runs. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path)) out.push(path);
  }
  return out;
}

const components = [...walk("app"), ...walk("components")];

/**
 * What a popover has to do, in one place.
 *
 * Two of these were written independently and diverged exactly the way
 * independently-written popovers always do. The account menu handled Escape,
 * returned focus to its trigger, wired aria-expanded/haspopup/controls, roved
 * arrow keys, bound its listeners only while open, and sat at z-50. The
 * notification bell did the outside click and nothing else: no Escape, no focus
 * return, no aria at all, a document listener bound for the life of the page
 * whether the panel was open or not, and a panel at z-10.
 *
 * That is not carelessness. It is what happens when a behaviour has no home:
 * the second implementation gets written from a memory of what a popover looks
 * like rather than of what it has to do. So the rule is not "these two files
 * are correct", it is "there is one implementation and everything uses it".
 */
describe("one popover, and it behaves like one", () => {
  const source = code(popover);

  it("closes on Escape and hands focus back to the trigger", () => {
    expect(source).toMatch(/event\.key === "Escape"[\s\S]{0,120}close\(\)/);
    expect(source).toContain("triggerRef.current?.focus()");
  });

  it("does not yank focus back when the person clicked somewhere else", () => {
    // Returning focus to the trigger on an outside click fights the pointer:
    // you click a field, the menu closes, and your caret is thrown backwards.
    expect(source).toMatch(/rootRef\.current\.contains[\s\S]{0,200}close\(false\)/);
  });

  it("binds its document listeners only while it is open", () => {
    expect(source).toMatch(/if \(!open\) return;[\s\S]{0,1400}addEventListener/);
    expect(source).toContain('document.removeEventListener("mousedown", onPointerDown)');
    expect(source).toContain('document.removeEventListener("keydown", onKeyDown)');
  });

  it("makes the aria wiring impossible to leave out", () => {
    // The trigger is a render prop precisely because these are the props that
    // get forgotten. A slot would let a call site render a bare button.
    for (const attr of ['"aria-haspopup"', '"aria-expanded"', '"aria-controls"']) {
      expect(source).toContain(attr);
    }
    expect(source).toContain("label: string");
    expect(source).toContain("aria-label={label}");
  });

  it("roves arrow keys through a menu but leaves content alone", () => {
    expect(source).toMatch(/if \(role !== "menu"\) return;/);
    expect(source).toMatch(/\["ArrowDown", "ArrowUp", "Home", "End"\]/);
  });

  it("sits on the named stacking rung rather than a number of its own", () => {
    expect(code(readFileSync("app/globals.css", "utf8"))).toMatch(
      /\.popover-panel \{[^}]*z-index: var\(--z-popover\)/
    );
    // Position is left to the component: an unlayered shared class that sets
    // `position` beats every utility a call site could use to move it, which
    // forces consumers into !important.
    expect(code(readFileSync("app/globals.css", "utf8"))).not.toMatch(
      /\.popover-panel \{[^}]*position:/
    );
  });
});

describe("nothing hand-rolls one alongside it", () => {
  it("checks a real number of components", () => {
    expect(components.length).toBeGreaterThan(150);
  });

  it("leaves no other outside-click dismissal in the app", () => {
    // The signature of a hand-rolled popover: a document pointer listener used
    // to close something. Popover is the one place that is allowed.
    const offenders = components.filter((path) => {
      if (path === "components/ui/Popover.tsx") return false;
      const source = code(readFileSync(path, "utf8"));
      return /addEventListener\(\s*"(mousedown|pointerdown|click)"/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("has both menus actually using it", () => {
    // Non-vacuity. Without this, deleting both menus would satisfy the rule
    // above, and so would a Popover nobody imports.
    for (const path of ["components/AccountMenu.tsx", "components/NotificationBell.tsx"]) {
      expect(code(readFileSync(path, "utf8")), path).toContain(
        'from "@/components/ui/Popover"'
      );
      expect(code(readFileSync(path, "utf8")), path).toMatch(/<Popover/);
      // And each spreads the aria props rather than rendering a bare button.
      expect(code(readFileSync(path, "utf8")), path).toContain("{...props}");
    }
  });
});

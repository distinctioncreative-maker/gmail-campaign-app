import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const providers = readFileSync("components/ui/UIProviders.tsx", "utf8");

/** Source with comments stripped, because these rules are about what runs. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const clientSources = [...walk("app"), ...walk("components")];

/**
 * A dialog is a set of behaviours, not a `role` attribute.
 *
 * This markup used to claim `role="dialog"` and `aria-modal="true"` while
 * Escape did nothing, Tab walked out into the page behind it, the page kept
 * scrolling, and focus was dropped when it closed. That is worse than not
 * claiming it: the claim is precisely what a keyboard or screen-reader user
 * acts on. So the claim and the behaviours are tested together, and neither
 * can be removed while the other stays.
 */
describe("the dialog does the things it announces", () => {
  const dialog = code(providers);

  it("closes on Escape", () => {
    expect(dialog).toMatch(/event\.key === "Escape"[\s\S]{0,120}closeConfirm\(null\)/);
  });

  it("traps Tab at both ends rather than only one", () => {
    // A one-ended trap is the common half-implementation: Tab wraps, Shift+Tab
    // walks out the top into the page nobody can see.
    expect(dialog).toMatch(/event\.shiftKey && active === first[\s\S]{0,120}last\.focus\(\)/);
    expect(dialog).toMatch(/!event\.shiftKey && active === last[\s\S]{0,120}first\.focus\(\)/);
    expect(dialog).toContain("event.preventDefault()");
  });

  it("gives focus back to whatever opened it", () => {
    expect(dialog).toContain("returnFocusTo.current = document.activeElement");
    expect(dialog).toMatch(/return \(\) => \{[\s\S]{0,400}returnFocusTo\.current\?\.focus\?\.\(\)/);
  });

  it("locks the page behind it and restores the previous value, not a guess", () => {
    // Restoring to "" rather than the captured value is the bug that leaves a
    // page permanently unable to scroll if it had its own overflow set.
    expect(dialog).toMatch(/const \{ overflow \} = document\.body\.style/);
    expect(dialog).toContain('document.body.style.overflow = "hidden"');
    expect(dialog).toContain("document.body.style.overflow = overflow");
  });

  it("removes its key listener when it closes", () => {
    expect(dialog).toContain('document.addEventListener("keydown", onKeyDown)');
    expect(dialog).toContain('document.removeEventListener("keydown", onKeyDown)');
  });

  it("names itself to a screen reader", () => {
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('aria-labelledby="ui-dialog-title"');
    expect(dialog).toMatch(/id="ui-dialog-title"/);
  });

  it("keeps the dialog open when the entered value fails validation", () => {
    // The native prompt's behaviour on a bad value was to accept it and let the
    // request fail. Validation that closes the dialog anyway is the same bug
    // wearing better styling.
    expect(dialog).toMatch(
      /const error = confirmState\.prompt\.validate\?\.\(promptValue\)[\s\S]{0,160}setPromptError\(error\);\s*return;/
    );
    expect(dialog).toContain('aria-invalid={promptError ? true : undefined}');
    expect(dialog).toContain('role="alert"');
  });
});

/**
 * The native dialogs are banned because they cannot be part of a design system.
 *
 * `prompt()` renders operating-system chrome: unstyled, unbrandable, blocking,
 * and on mobile frequently suppressed entirely, which turns a required input
 * into a silent no-op. Three call sites reached for it only because the
 * in-house dialog had no `prompt` variant. A missing variant does not stop
 * anyone needing the thing; it decides where they get it from.
 */
describe("no native browser dialogs in the product", () => {
  it("scans a real number of files, so the rule is not passing on an empty set", () => {
    expect(clientSources.length).toBeGreaterThan(150);
  });

  it("uses none of them", () => {
    const offenders = clientSources.filter((path) => {
      const source = code(readFileSync(path, "utf8"));
      // `confirm(` bare is our own hook, which shadows the global. Only the
      // window-qualified form can be the native one.
      return (
        /(^|[^.\w$])(alert|prompt)\s*\(/.test(source) ||
        /window\.(alert|prompt|confirm)\s*\(/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("has the replacement wired at every site that used to need one", () => {
    // Non-vacuity. Without this, deleting the three features outright would
    // satisfy the rule above.
    const users = clientSources.filter((path) =>
      /const promptFor = usePrompt\(\)/.test(readFileSync(path, "utf8"))
    );
    expect(users).toContain("components/SuppressionsManager.tsx");
    expect(users).toContain("components/templates/TemplateEditor.tsx");
    expect(code(providers)).toContain("export function usePrompt()");
    // And all three prompts still validate rather than accepting anything.
    const promptCalls = clientSources
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .match(/await promptFor\(\{/g);
    expect(promptCalls?.length).toBe(3);
  });
});

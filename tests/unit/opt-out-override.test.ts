import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const classify = readFileSync("lib/leads/classify.ts", "utf8");
const importRoute = readFileSync("app/api/leads/import/route.ts", "utf8");
const parseRoute = readFileSync("app/api/leads/parse-csv/route.ts", "utf8");
const contacts = readFileSync("lib/repositories/contacts.ts", "utf8");
const choice = readFileSync("components/imports/OptOutColumnChoice.tsx", "utf8");

/** Source with comments stripped, because these rules are about what runs. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The boundary between "a column in a file someone uploaded" and "a person who
 * asked us to stop".
 *
 * These are two different facts that share one word, and the whole safety of
 * this feature is that only the first is overridable. The reason codes already
 * separate them: EMAIL_OPT_OUT is written in exactly one place, from a column
 * in an uploaded file. UNSUBSCRIBED, HARD_BOUNCE and COMPLAINT come from the
 * recipient. MANUAL is a deliberate decision someone made inside the product.
 *
 * If that separation ever blurs, this feature stops being a convenience and
 * becomes a way to email people who told you not to. So it is tested as a
 * boundary rather than as a behaviour.
 */
describe("the opt-out override reaches a file column and nothing else", () => {
  it("only ever writes the one reason code that comes from a file", () => {
    // The premise the whole design rests on: if EMAIL_OPT_OUT ever gets written
    // from somewhere else, the override silently widens to cover that too.
    const writers = [
      "app/api/leads/import/route.ts",
      "lib/unsubscribe/suppression.ts",
      "lib/campaigns/monitoring.ts",
      "app/api/suppressions/route.ts",
      "lib/repositories/contacts.ts",
    ]
      .map((path) => [path, code(readFileSync(path, "utf8"))] as const)
      .filter(([, source]) => /reason:\s*"EMAIL_OPT_OUT"/.test(source))
      .map(([path]) => path);

    expect(writers).toEqual(["app/api/leads/import/route.ts"]);
  });

  it("leaves a real unsubscribe, bounce or complaint untouchable", () => {
    const overrideScope = code(classify);

    // The classifier may only widen for EMAIL_OPT_OUT. Naming the others here
    // means adding one to the overridable set fails this immediately.
    for (const reason of ["UNSUBSCRIBED", "HARD_BOUNCE", "COMPLAINT", "MANUAL", "INVALID"]) {
      expect(
        new RegExp(`ignoreFileOptOut[^;]*${reason}`).test(overrideScope),
        `${reason} must never be in scope for the override`
      ).toBe(false);
    }
    expect(overrideScope).toContain('suppression?.reason === "EMAIL_OPT_OUT"');

    // And the import route's override guards only the one addSuppression call,
    // which writes only that reason.
    expect(code(importRoute)).toMatch(
      /if \(!ignoreFileOptOut\) \{[\s\S]{0,400}?reason: "EMAIL_OPT_OUT"/
    );
  });

  it("still suppresses by default, so the override cannot become the default", () => {
    // Non-vacuity. Without this, deleting the addSuppression call entirely
    // would satisfy every other rule in this file.
    expect(code(importRoute)).toContain("addSuppression");
    expect(code(importRoute)).toMatch(/ignoreFileOptOut: z\.boolean\(\)\.default\(false\)/);
    expect(code(parseRoute)).toContain("ignoreFileOptOut = false");
    // The classifier's default path still blocks.
    expect(code(classify)).toContain(
      'if (lead.emailOptOut === true && !ignoreFileOptOut)'
    );
  });

  it("refuses the override without a stated reason", () => {
    expect(code(importRoute)).toMatch(
      /ignoreFileOptOut && optOutOverrideReason\.trim\(\)\.length < 3/
    );
    // And the reason reaches the audit log rather than being collected and
    // dropped, which is the failure that makes a required field theatre.
    expect(code(importRoute)).toContain('action: "leads.opt_out_column_overridden"');
    expect(code(importRoute)).toMatch(/reason: optOutOverrideReason/);
  });

  it("clears rather than inherits the flag when a contact is re-imported", () => {
    /**
     * The subtle one. Import a file respecting the column, decide the column
     * was wrong, re-import with the override: the merge at the existing-contact
     * branch would have read `lead.emailOptOut ?? existing.emailOptOut` and put
     * the flag straight back. The override would appear to work and the
     * contact would still be marked.
     */
    expect(code(contacts)).toMatch(
      /emailOptOut: options\.ignoreFileOptOut === true \? false :/
    );
    // Same for the earlier suppression: a doc written by the first import must
    // not keep blocking after the decision changes.
    expect(code(classify)).toContain("const overridable =");
  });

  it("asks the question only when there is something to decide", () => {
    // A control that appears on every import, including the ones with no
    // opt-out column, is how people stop reading controls.
    expect(code(readFileSync("components/imports/CsvUpload.tsx", "utf8"))).toContain(
      "state.optOutColumn && state.fileOptOutCount > 0"
    );
    expect(code(parseRoute)).toContain('includes("emailOptOut")');
  });

  it("says on screen what the override cannot do", () => {
    // The user-facing half of the boundary. If the copy stops saying this, the
    // control starts looking like it can switch off unsubscribes.
    expect(choice).toMatch(/unsubscribed from your email, bounced, or\s+complained/);
    expect(choice).toContain("cannot reach them");
    // Respecting it is the default and is listed first.
    expect(choice.indexOf("Respect it")).toBeLessThan(
      choice.indexOf("means something else here")
    );
  });
});

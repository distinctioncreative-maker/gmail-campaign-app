import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSENT_BASES,
  CONSENT_BASIS_COPY,
  DEFAULT_CONSENT_BASIS,
  SELECTABLE_CONSENT_BASES,
  isBasisRecorded,
} from "@/lib/compliance/consent";
import { ContactSchema } from "@/schemas/contact";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("the lawful-basis vocabulary", () => {
  it("never offers UNKNOWN as something a person can choose", () => {
    /**
     * UNKNOWN exists only for rows imported before the field did. If it ever
     * appears in a picker it becomes the path of least resistance and the whole
     * exercise is theatre: everyone clicks the option that asserts nothing.
     */
    expect(SELECTABLE_CONSENT_BASES).not.toContain("UNKNOWN");
    expect(CONSENT_BASES).toContain("UNKNOWN");
    expect(SELECTABLE_CONSENT_BASES.length).toBe(CONSENT_BASES.length - 1);
  });

  it("defaults to a basis that is actually selectable", () => {
    // A default outside the selectable set would render a picker with nothing
    // checked, which is how people end up submitting whatever is first.
    expect(SELECTABLE_CONSENT_BASES).toContain(DEFAULT_CONSENT_BASIS);
  });

  it("explains every basis in words a salesperson can answer", () => {
    for (const basis of CONSENT_BASES) {
      const copy = CONSENT_BASIS_COPY[basis];
      expect(copy, `missing copy for ${basis}`).toBeDefined();
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.meaning.length).toBeGreaterThan(20);
      // Legal citations in a dropdown get answered at random. The options have
      // to describe situations, not statutes.
      expect(`${copy.label} ${copy.meaning}`).not.toMatch(
        /article\s*6|art\.\s*6|GDPR|PECR|CAN-?SPAM|\b6\(1\)\(f\)/i
      );
    }
    // Every selectable option needs a concrete example, so nobody has to guess
    // which situation describes them.
    for (const basis of SELECTABLE_CONSENT_BASES) {
      expect(CONSENT_BASIS_COPY[basis].example.length).toBeGreaterThan(0);
    }
  });

  it("treats exactly the unselectable basis as unrecorded", () => {
    expect(isBasisRecorded("UNKNOWN")).toBe(false);
    for (const basis of SELECTABLE_CONSENT_BASES) {
      expect(isBasisRecorded(basis), `${basis} should count as recorded`).toBe(true);
    }
  });
});

describe("the contact record", () => {
  it("defaults a contact with no basis to UNKNOWN rather than refusing it", () => {
    /**
     * Contacts written before this field existed do not carry it. If the schema
     * required it, every read of a legacy contact would throw and the app would
     * break on exactly the workspaces with the most history.
     */
    const now = Date.now();
    const parsed = ContactSchema.parse({
      contactId: "c1",
      ownerUserId: "u1",
      organizationId: "o1",
      normalizedEmail: "a@b.com",
      email: "a@b.com",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.consentBasis).toBe("UNKNOWN");
    expect(parsed.consentRecordedAt).toBeNull();
  });

  it("keeps lead source and lawful basis as separate fields", () => {
    // Collapsing them would be the tempting simplification and it loses the
    // distinction the field exists for: where a row came from is not the same
    // question as what it entitles you to do.
    const shape = Object.keys(ContactSchema.shape);
    expect(shape).toContain("leadSource");
    expect(shape).toContain("consentBasis");
  });
});

describe("every path that creates a contact", () => {
  /**
   * The rule, stated once: a server route that writes a contact must decide the
   * lawful basis explicitly. This is checked against the whole API surface
   * rather than against the three routes that exist today, so a fourth import
   * path added later fails here instead of silently writing UNKNOWN.
   */
  const routes = walk("app/api").filter((path) => {
    const source = readFileSync(path, "utf8");
    return (
      /ContactSchema\.parse|upsertFromParsedLead/.test(source) &&
      // Reading contacts back is not creating them.
      /\.create\(|upsertFromParsedLead/.test(source)
    );
  });

  it("finds the contact-writing routes, so the rule below is not vacuous", () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });

  it("names a consent basis rather than letting the schema default apply", () => {
    const silent = routes.filter(
      (path) => !/consentBasis/.test(readFileSync(path, "utf8"))
    );
    expect(
      silent,
      "these routes write contacts without deciding a lawful basis"
    ).toEqual([]);
  });
});

describe("the import request", () => {
  it("refuses UNKNOWN from a client", () => {
    /**
     * The server accepting UNKNOWN would reopen the gap from the other side: a
     * client could send it and land contacts that assert nothing, while the UI
     * looked like it had asked. The route builds its enum from the selectable
     * set precisely so this cannot drift.
     */
    const route = readFileSync("app/api/leads/import/route.ts", "utf8");
    expect(route).toContain("z.enum(SELECTABLE_CONSENT_BASES)");
    expect(route).not.toMatch(/consentBasis:.*"UNKNOWN"/);
  });

  it("carries the declaration on every batch, not just the first", () => {
    /**
     * A large file is split into several requests. Sending the basis only with
     * the first would leave the tail of a long list unrecorded — a bug that
     * looks fine on any list small enough to test by hand.
     */
    const table = readFileSync("components/imports/LeadPreviewTable.tsx", "utf8");
    const body = table.slice(table.indexOf("for (let index = 0"), table.indexOf("onDone("));
    expect(body).toContain("consentBasis");
  });
});

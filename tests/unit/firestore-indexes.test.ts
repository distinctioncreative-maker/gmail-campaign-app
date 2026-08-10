import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Collection-group queries need declared indexes, and this has bitten twice.
 *
 * Firestore creates single-field indexes automatically, but only at COLLECTION
 * scope. A `collectionGroup(x).where(y, ...)` needs `y` declared at
 * COLLECTION_GROUP scope in firestore.indexes.json or it throws
 * FAILED_PRECONDITION the first time it runs.
 *
 * That failure mode is unusually nasty: TypeScript is happy, the unit tests are
 * happy, the build is happy, and the query works fine in the emulator, which does
 * not enforce indexes. It fails only in production, only on the code path that
 * uses it, which for a rarely-visited page can be a long time after the deploy.
 *
 * Both occurrences were found by reading rather than by any test. So the sweep
 * below reads the source instead, and fails at the point the query is written.
 */

interface Declared {
  collectionGroup: string;
  fieldPath: string;
  scopes: string[];
}

function declaredOverrides(): Declared[] {
  const json = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
    fieldOverrides?: Array<{
      collectionGroup: string;
      fieldPath: string;
      indexes?: Array<{ queryScope?: string }>;
    }>;
  };
  return (json.fieldOverrides ?? []).map((row) => ({
    collectionGroup: row.collectionGroup,
    fieldPath: row.fieldPath,
    scopes: (row.indexes ?? []).map((index) => String(index.queryScope ?? "")),
  }));
}

/** Every .ts under lib and app, excluding tests. */
function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(entry)) {
        out.push({ file: path, text: readFileSync(path, "utf8") });
      }
    }
  };
  walk("lib");
  walk("app");
  return out;
}

/**
 * Find `collectionGroup("x")` followed by a `.where("y"` before the query is
 * executed. Deliberately a simple scan over the text between the call and the
 * next `.get(`: a real parser would be more precise and this has caught the
 * cases that actually occur, which are all written as one chained expression.
 */
function collectionGroupFilters(): { file: string; group: string; field: string }[] {
  const found: { file: string; group: string; field: string }[] = [];
  for (const { file, text } of sources()) {
    const pattern = /collectionGroup\(\s*["'`]([\w.]+)["'`]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const group = match[1];
      // The chained expression ends at the first .get( or .count( after the call.
      const rest = text.slice(match.index, match.index + 600);
      const end = rest.search(/\.(get|count)\(/);
      const chain = end === -1 ? rest : rest.slice(0, end);
      const wheres = chain.matchAll(/\.where\(\s*["'`]([\w.]+)["'`]/g);
      for (const where of wheres) {
        found.push({ file, group, field: where[1] });
      }
    }
  }
  return found;
}

describe("collection-group queries have the indexes they need", () => {
  const filters = collectionGroupFilters();
  const declared = declaredOverrides();

  it("finds the collection-group queries at all", () => {
    // Guards the check below against passing vacuously if the scan breaks or the
    // queries move.
    expect(filters.length).toBeGreaterThan(0);
  });

  it("declares every filtered field at COLLECTION_GROUP scope", () => {
    const missing = filters.filter(({ group, field }) => {
      const row = declared.find(
        (entry) => entry.collectionGroup === group && entry.fieldPath === field
      );
      return !row || !row.scopes.includes("COLLECTION_GROUP");
    });
    // The message names the file, because the fix is a JSON entry and the person
    // reading this failure needs to know which query wants it.
    expect(
      missing.map(({ file, group, field }) => `${file}: collectionGroup(${group}).where(${field})`)
    ).toEqual([]);
  });

  it("covers the two that shipped broken", () => {
    // organizationSettings.trackingDomain.status was found in review; campaigns
    // .organizationId and organizationSettings.sendingMode were found the same
    // way a round later. Naming them keeps the regression explicit.
    for (const [group, field] of [
      ["organizationSettings", "trackingDomain.status"],
      ["campaigns", "organizationId"],
      ["organizationSettings", "sendingMode"],
    ]) {
      const row = declared.find(
        (entry) => entry.collectionGroup === group && entry.fieldPath === field
      );
      expect(row, `${group}.${field}`).toBeDefined();
      expect(row!.scopes, `${group}.${field}`).toContain("COLLECTION_GROUP");
    }
  });
});

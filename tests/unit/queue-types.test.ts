import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENQUEUEABLE_QUEUE_TYPES } from "@/schemas/campaign";

function sources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Three queue types are produced by nothing and handled by nothing:
 * CHECK_REPLY, CHECK_BOUNCE and SYNC_AUDIT_SHEET. Reply and bounce detection
 * run from cron/sweep rather than from the queue, and there has never been an
 * audit sheet.
 *
 * They stay in the read schema on purpose. That enum parses documents coming
 * back out of Firestore, so deleting a value converts any stale record carrying
 * it from a harmless leftover into a parse error, and whether such records exist
 * is not knowable from the source. So the cleanup is enforced on the write side
 * instead, which is where it actually protects something: old data keeps
 * loading, and no new code can start using a type nothing consumes.
 */
describe("the queue only enqueues types something consumes", () => {
  const files = [...sources("lib"), ...sources("app")];

  it("never writes a legacy queue type", () => {
    const dead = ["CHECK_REPLY", "CHECK_BOUNCE", "SYNC_AUDIT_SHEET"];
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const type of dead) {
        // `type: "X"` is the write shape. A comparison against item.type is a
        // read and stays legal, which is what lets the worker keep handling
        // anything already in the queue.
        if (new RegExp(`type:\\s*"${type}"`).test(source)) {
          offenders.push(`${file} enqueues ${type}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the legacy values readable, so stale records still parse", () => {
    const schema = readFileSync("schemas/campaign.ts", "utf8");
    for (const type of ["CHECK_REPLY", "CHECK_BOUNCE", "SYNC_AUDIT_SHEET"]) {
      expect(schema, `${type} must stay parseable`).toContain(`"${type}"`);
    }
    // And the write list must not have quietly grown to include them.
    expect([...ENQUEUEABLE_QUEUE_TYPES].sort()).toEqual([
      "CREATE_FOLLOWUP_DRAFT",
      "CREATE_INITIAL_DRAFT",
      "SEND_FOLLOWUP",
      "SEND_INITIAL",
    ]);
  });

  it("still enqueues the live types, so this is not guarding an empty set", () => {
    const all = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const type of ["SEND_INITIAL", "SEND_FOLLOWUP", "CREATE_INITIAL_DRAFT"]) {
      expect(all, `${type} should still be produced`).toContain(type);
    }
  });
});

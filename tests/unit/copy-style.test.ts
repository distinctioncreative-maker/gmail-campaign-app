import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOTS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = /\.(?:css|ts|tsx)$/;
const EM_DASH = String.fromCodePoint(0x2014);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

describe("user-facing copy style", () => {
  it("does not reintroduce em dashes into application source", () => {
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles)
      .filter((file) => readFileSync(file, "utf8").includes(EM_DASH))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});

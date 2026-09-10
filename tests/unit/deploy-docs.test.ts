import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One deploy path, documented once.
 *
 * `docs/operations/deployment.md` has always said this repo deploys by
 * submitting `cloudbuild.yaml`, which runs `docker build` against the
 * Dockerfile. `docs/operations/add-a-company.md` said `gcloud run deploy
 * --source .`, which hands the directory to Cloud Build's universal builder
 * and lets it guess the language. It guessed Python, looked for a `main.py`,
 * and failed the build.
 *
 * Two docs disagreeing is how someone follows the wrong one, so this keeps the
 * losing form out of the repo.
 */

function docs(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...docs(path));
    else if (entry.name.endsWith(".md")) found.push(path);
  }
  return found;
}

const files = [...docs("docs"), "README.md", "AGENTS.md", "CLAUDE.md"];

describe("deploy documentation", () => {
  it("reads the docs, so a bad path cannot make this vacuous", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("never recommends the buildpack path", () => {
    const offenders = files.filter((file) =>
      /gcloud run deploy[^\n]*--source\s/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the real path written down, with the substitution manual builds need", () => {
    const deployment = readFileSync("docs/operations/deployment.md", "utf8");
    expect(deployment).toContain("gcloud builds submit");
    expect(deployment).toContain("--config cloudbuild.yaml");
    // Manual submissions do not populate COMMIT_SHA, and cloudbuild.yaml tags
    // the image with it. Without this the build fails on an empty tag.
    expect(deployment).toContain("COMMIT_SHA=");
  });

  it("does not ship an image built from a stale or foreign context", () => {
    // Both files exist and agree: docker and gcloud must filter identically,
    // or a build that works locally fails in Cloud Build and vice versa.
    const dockerignore = readFileSync(".dockerignore", "utf8");
    const gcloudignore = readFileSync(".gcloudignore", "utf8");
    for (const entry of ["node_modules", ".next", ".git"]) {
      expect(dockerignore).toContain(entry);
      expect(gcloudignore).toContain(entry);
    }
    // tests/ is needed by the production build; excluding it breaks it.
    expect(dockerignore).not.toMatch(/^tests$/m);
    expect(gcloudignore).not.toMatch(/^tests$/m);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("template editor selection regression", () => {
  it("does not replace contentEditable HTML while processing the same user input", () => {
    const source = readFileSync(
      new URL("../../components/templates/TemplateEditor.tsx", import.meta.url),
      "utf8"
    );
    const syncBody = source.match(
      /function syncFromEditor\(\) \{([\s\S]*?)\n  \}/
    )?.[1];

    expect(syncBody).toBeTruthy();
    expect(syncBody).toContain("lastVisualInputRef.current = nextHtml");
    expect(syncBody).not.toContain("editorRef.current.innerHTML =");
    expect(source).toContain("if (lastVisualInputRef.current === html)");
  });
});

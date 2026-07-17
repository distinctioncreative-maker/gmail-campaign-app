import { describe, expect, it } from "vitest";
import {
  findUnsupportedCss,
  htmlToPlainText,
  sanitizeEmailHtml,
} from "@/lib/sanitize/html";

describe("sanitizeEmailHtml", () => {
  it("strips script tags and event handlers", () => {
    const dirty = `<p onclick="steal()">Hi</p><script>alert(1)</script><img src="x" onerror="p()">`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).toContain("<p>Hi</p>");
  });

  it("preserves tables and inline styles", () => {
    const html = `<table width="600" cellpadding="0"><tr><td style="color:#333;padding:8px">Cell</td></tr></table>`;
    const clean = sanitizeEmailHtml(html);
    expect(clean).toContain("<table");
    expect(clean).toContain('style="color:#333;padding:8px"');
  });

  it("blocks javascript: URLs but keeps https links", () => {
    const html = `<a href="javascript:alert(1)">bad</a><a href="https://ok.com">good</a>`;
    const clean = sanitizeEmailHtml(html);
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain('href="https://ok.com"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it("removes iframes and forms entirely", () => {
    const clean = sanitizeEmailHtml(`<iframe src="https://x.com"></iframe><form><input></form>ok`);
    expect(clean).not.toContain("iframe");
    expect(clean).not.toContain("form");
    expect(clean).toContain("ok");
  });
});

describe("htmlToPlainText", () => {
  it("converts structure to line breaks and bullets", () => {
    const text = htmlToPlainText("<h1>Hi</h1><p>One</p><ul><li>A</li><li>B</li></ul>");
    expect(text).toContain("Hi");
    expect(text).toContain("• A");
    expect(text.split("\n").length).toBeGreaterThan(2);
  });

  it("decodes entities", () => {
    expect(htmlToPlainText("Fish &amp; Chips&nbsp;&lt;3")).toBe("Fish & Chips <3");
  });
});

describe("findUnsupportedCss", () => {
  it("warns on flex and media queries", () => {
    const warnings = findUnsupportedCss(
      `<div style="display:flex">x</div><style>@media(max-width:600px){}</style>`
    );
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });
  it("stays quiet for table layouts", () => {
    expect(findUnsupportedCss(`<table><tr><td style="padding:4px">x</td></tr></table>`)).toEqual([]);
  });
});

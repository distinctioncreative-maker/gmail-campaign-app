import sanitizeHtmlLib from "sanitize-html";

/**
 * Email-safe HTML sanitization for pasted/imported template content.
 * Preserves tables and inline styles (needed for email layouts); strips
 * scripts, event handlers, iframes, forms, and non-http(s) URLs.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "a", "b", "strong", "i", "em", "u", "s", "br", "p", "div", "span",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "ul", "ol", "li", "hr", "img",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "center", "font", "small", "sup", "sub",
    ],
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "border",
        "cellpadding", "cellspacing", "bgcolor", "color", "dir", "lang"],
      a: ["href", "target", "rel", "style"],
      img: ["src", "alt", "width", "height", "style", "border"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Allow inline data: images so pasted Gmail signatures keep embedded
    // logos. data:image URIs cannot execute script, so this is XSS-safe.
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
    },
  });
}

/** Rough plain-text fallback from HTML for the text/plain MIME part. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Warn (don't block) about CSS features many email clients ignore. */
export function findUnsupportedCss(html: string): string[] {
  const warnings: string[] = [];
  if (/position\s*:\s*(fixed|absolute)/i.test(html))
    warnings.push("Positioned layouts (position: fixed/absolute) don't work in most email apps.");
  if (/display\s*:\s*(flex|grid)/i.test(html))
    warnings.push("Flexbox/grid layouts may not render in Outlook; tables are safer.");
  if (/@media/i.test(html))
    warnings.push("Media queries are ignored by some email apps; the desktop layout should stand alone.");
  if (/<link[^>]+stylesheet/i.test(html) || /@import/i.test(html))
    warnings.push("External stylesheets are stripped by email apps; use inline styles.");
  return warnings;
}

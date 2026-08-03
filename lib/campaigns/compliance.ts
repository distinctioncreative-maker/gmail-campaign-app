import { listPlaceholders } from "@/lib/personalization/render";

export const REQUIRED_COMMERCIAL_EMAIL_PLACEHOLDERS = [
  "physical_address",
  "unsubscribe_text",
] as const;

export type CommercialEmailPlaceholder =
  (typeof REQUIRED_COMMERCIAL_EMAIL_PLACEHOLDERS)[number];

/**
 * Return required commercial-email footer fields that are absent from the
 * message body. Keeping this pure makes the launch rule easy to test and keeps
 * every campaign path aligned.
 */
export function missingCommercialEmailPlaceholders(
  htmlTemplate: string
): CommercialEmailPlaceholder[] {
  const used = new Set(listPlaceholders(htmlTemplate));
  return REQUIRED_COMMERCIAL_EMAIL_PLACEHOLDERS.filter(
    (placeholder) => !used.has(placeholder)
  );
}

/**
 * Add only the commercial-email fields that are missing. This is used by the
 * template editor's recommended compliance mode. The placeholders are stored
 * in the template so campaign launch validation still fails closed if the
 * sender profile is incomplete.
 */
export function appendMissingCommercialFooter(htmlTemplate: string): string {
  const missing = missingCommercialEmailPlaceholders(htmlTemplate);
  if (missing.length === 0) return htmlTemplate;

  const rows: string[] = [];
  if (missing.includes("physical_address")) {
    rows.push("{{physical_address}}");
  }
  if (missing.includes("unsubscribe_text")) {
    rows.push("{{unsubscribe_text}}");
  }

  const footer = `<p style="margin-top:32px;font-size:12px;line-height:1.5;color:#6b7280">${rows.join("<br>")}</p>`;
  return /<\/body>/i.test(htmlTemplate)
    ? htmlTemplate.replace(/<\/body>/i, `${footer}</body>`)
    : `${htmlTemplate}${footer}`;
}

/**
 * Add the server-signed, visible opt-out link to a rendered real message.
 * This runs after link tracking so the opt-out URL can never be rewritten or
 * depend on the tracking redirect service.
 */
export function appendVisibleUnsubscribeLink(
  renderedHtml: string,
  unsubscribeUrl: string
): string {
  const parsed = new URL(unsubscribeUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Unsubscribe URL must use HTTP or HTTPS");
  }
  const safeUrl = parsed
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const link = `<p style="margin-top:12px;font-size:12px;line-height:1.5;color:#6b7280"><a href="${safeUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a></p>`;
  return /<\/body>/i.test(renderedHtml)
    ? renderedHtml.replace(/<\/body>/i, `${link}</body>`)
    : `${renderedHtml}${link}`;
}

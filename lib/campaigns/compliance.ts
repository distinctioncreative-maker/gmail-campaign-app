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

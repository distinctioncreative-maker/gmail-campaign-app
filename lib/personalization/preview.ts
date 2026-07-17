import "server-only";
import type { Scope } from "@/lib/repositories/scope";
import { getContact } from "@/lib/repositories/contacts";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import {
  FAKE_PREVIEW_VALUES,
  renderTemplate,
  valuesFromContact,
  valuesFromSenderProfile,
  type PlaceholderValues,
} from "./render";

export interface RenderedEmail {
  subject: string;
  html: string;
  unresolved: string[];
}

/**
 * Render a subject+body pair for a specific contact (or fake preview data),
 * always layering in the user's sender profile values.
 */
export async function renderForPreview(
  ctx: Scope,
  subjectTemplate: string,
  htmlTemplate: string,
  contactId?: string | null
): Promise<RenderedEmail> {
  const profile = await getSenderProfile(ctx);
  let values: PlaceholderValues;

  if (contactId) {
    const contact = await getContact(ctx, contactId);
    values = contact
      ? { ...valuesFromContact(contact), ...valuesFromSenderProfile(profile) }
      : { ...FAKE_PREVIEW_VALUES, ...valuesFromSenderProfile(profile) };
  } else {
    // Fake lead data, but the user's real sender values where present.
    const sender = valuesFromSenderProfile(profile);
    values = { ...FAKE_PREVIEW_VALUES };
    for (const [k, v] of Object.entries(sender)) {
      if (v) values[k as keyof PlaceholderValues] = v;
    }
  }

  const subject = renderTemplate(subjectTemplate, values);
  const body = renderTemplate(htmlTemplate, values);
  return {
    subject: subject.output,
    html: body.output,
    unresolved: [...new Set([...subject.unresolved, ...body.unresolved])],
  };
}

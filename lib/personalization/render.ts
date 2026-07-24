import type { Contact } from "@/schemas/contact";
import type { SenderProfile } from "@/schemas/userSettings";

/** The supported placeholders (spec §11). */
export const PLACEHOLDERS = [
  "first_name",
  "last_name",
  "full_name",
  "business_name",
  "email",
  "phone",
  "region",
  "requested_amount",
  "lead_source",
  "sender_name",
  "sender_title",
  "sender_phone",
  "sender_email",
  "company_name",
  "company_website",
  "physical_address",
  "unsubscribe_text",
  "signature",
  "ai_opener",
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export type PlaceholderValues = Partial<Record<Placeholder, string>>;

/**
 * Placeholders that quietly disappear when they have no value, instead of
 * being reported unresolved and blocking a launch. The signature is optional:
 * leaving it blank in Settings (or when a Gmail draft already includes your
 * own signature) simply removes {{signature}} rather than printing it.
 */
export const OPTIONAL_PLACEHOLDERS: ReadonlySet<string> = new Set(["signature", "ai_opener"]);

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function valuesFromContact(
  contact: Pick<
    Contact,
    | "firstName" | "lastName" | "fullName" | "businessName" | "email"
    | "phone" | "region" | "requestedAmount" | "leadSource"
  >
): PlaceholderValues {
  return {
    first_name: contact.firstName,
    last_name: contact.lastName,
    full_name: contact.fullName,
    business_name: contact.businessName,
    email: contact.email,
    phone: contact.phone,
    region: contact.region,
    requested_amount:
      contact.requestedAmount !== null ? `$${contact.requestedAmount.toLocaleString()}` : "",
    lead_source: contact.leadSource,
  };
}

export function valuesFromSenderProfile(profile: SenderProfile): PlaceholderValues {
  return {
    sender_name: profile.senderName,
    sender_title: profile.senderTitle,
    sender_phone: profile.senderPhone,
    sender_email: profile.senderEmail,
    company_name: profile.companyName,
    company_website: profile.companyWebsite,
    physical_address: profile.physicalAddress,
    unsubscribe_text: profile.unsubscribeText,
    signature: profile.signature,
  };
}

export const FAKE_PREVIEW_VALUES: PlaceholderValues = {
  first_name: "Jordan",
  last_name: "Rivera",
  full_name: "Jordan Rivera",
  business_name: "Rivera Roofing LLC",
  email: "jordan@riveraroofing.com",
  phone: "(555) 201-8890",
  region: "Central",
  requested_amount: "$25,000",
  lead_source: "Sunrise",
  sender_name: "Alex Salesperson",
  sender_title: "Funding Advisor",
  sender_phone: "(555) 640-2210",
  sender_email: "alex@yourcompany.com",
  company_name: "Your Company",
  company_website: "https://yourcompany.com",
  physical_address: "123 Main St, Suite 400, New York, NY 10001",
  unsubscribe_text: "If you'd prefer not to hear from me again, just reply and let me know.",
  signature: "Alex Salesperson · Funding Advisor · Your Company",
  ai_opener: "Congrats on the recent expansion at Rivera Roofing — impressive momentum.",
};

export interface RenderResult {
  output: string;
  unresolved: string[];
}

/**
 * Replace {{placeholders}} in a template. Unknown or empty placeholders are
 * left in place and reported so the UI can highlight them and launch can be
 * blocked (spec: never send with unresolved placeholders).
 */
export function renderTemplate(template: string, values: PlaceholderValues): RenderResult {
  const unresolved = new Set<string>();
  const output = template.replace(PLACEHOLDER_RE, (whole, name: string) => {
    const value = values[name as Placeholder];
    if (value === undefined || value === "") {
      // Optional placeholders (e.g. the signature) collapse to nothing when
      // empty so a blank signature turns the tag off instead of blocking.
      if (OPTIONAL_PLACEHOLDERS.has(name)) return "";
      unresolved.add(name);
      return whole;
    }
    return value;
  });
  return { output, unresolved: [...unresolved] };
}

/** List every placeholder mentioned in a template. */
export function listPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) found.add(match[1]);
  return [...found];
}

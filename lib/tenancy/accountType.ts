import type { TenantType } from "@/schemas/user";

/**
 * Generic email providers whose accounts are personal, not organizations.
 * A sign-in from one of these is a Solo (CONSUMER) tenant, so consumers each
 * get a private per-user workspace instead of all sharing one domain org.
 */
export const PUBLIC_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

/**
 * Tenant type from the email domain. Any real (custom) domain is a WORKSPACE
 * keyed by that domain, so coworkers land in the same org exactly as today.
 * A known public provider (or a missing domain) is a CONSUMER, keyed per user.
 * Domain-based on purpose: it does not depend on the Google `hd` claim
 * surviving in the session cookie, so existing Workspace orgs are never
 * reclassified.
 */
export function tenantTypeFor(emailDomain: string): TenantType {
  const d = emailDomain.trim().toLowerCase();
  if (!d || PUBLIC_EMAIL_PROVIDERS.has(d)) return "CONSUMER";
  return "WORKSPACE";
}

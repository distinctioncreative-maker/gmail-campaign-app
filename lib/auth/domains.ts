/**
 * Workspace domain allowlist. ALLOWED_GOOGLE_WORKSPACE_DOMAIN accepts a
 * comma-separated list (e.g. "alpinefundings.com,everestbusinessfunding.com").
 * Pure functions so the policy is unit-testable.
 */

export function parseAllowedDomains(raw: string): string[] {
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/**
 * An account is allowed when its email domain is on the list, and — when
 * Google supplied an hd claim — that claim is also on the list. The hd
 * claim alone is never sufficient; the email domain is always checked.
 * An empty allowlist means no restriction (development only).
 */
export function isAllowedAccount(
  email: string,
  hd: string | null,
  allowedDomains: string[]
): boolean {
  if (allowedDomains.length === 0) return true;
  const emailDomain = email.toLowerCase().split("@")[1] ?? "";
  if (!allowedDomains.includes(emailDomain)) return false;
  if (hd !== null && !allowedDomains.includes(hd.toLowerCase())) return false;
  return true;
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Workspace API keys.
 *
 * Three properties matter and each one is a decision rather than a default:
 *
 * **The raw key is never stored.** Only a SHA-256 hash of it. A database dump,
 * a stray log line, or a support engineer reading a document can then never
 * yield a working credential. The consequence the UI has to live with is that a
 * key is displayed exactly once, at creation, and cannot be recovered: that is
 * the point, not a limitation to work around.
 *
 * **A visible prefix identifies a key without revealing it.** Someone with four
 * keys needs to know which one to revoke, and "the one ending 3f9a" is not an
 * answer if the key was never shown again. The first characters after the
 * environment marker are stored in the clear for exactly this.
 *
 * **Lookup is by hash and comparison is constant-time.** Scanning candidates
 * and comparing with `===` would leak, through response timing, how much of a
 * guessed key was correct, which turns a 32-byte secret into a series of
 * one-byte guesses.
 *
 * No hashing cost beyond SHA-256 on purpose. Key material is 32 random bytes,
 * not a human-chosen password, so there is nothing for bcrypt to slow down: an
 * attacker cannot dictionary-attack 2^256, and a per-request KDF would add
 * latency to every API call for no gain.
 */

/** `cad` for the product, then live/test, then the secret. */
const PREFIX_LIVE = "cad_live_";
const PREFIX_TEST = "cad_test_";
/** Enough of the secret to identify a key in a list, not enough to guess it. */
const DISPLAY_CHARS = 6;
const SECRET_BYTES = 32;

export type KeyEnvironment = "live" | "test";

export const API_SCOPES = [
  "leads:read",
  "leads:write",
  "campaigns:read",
  "campaigns:write",
  "reports:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface GeneratedKey {
  /** Shown once, never stored. */
  secret: string;
  /** Stored, and safe to display. */
  hash: string;
  display: string;
  environment: KeyEnvironment;
}

export function generateApiKey(environment: KeyEnvironment = "live"): GeneratedKey {
  // base64url rather than hex: same entropy in fewer characters, and no
  // characters that need escaping in a header or a shell.
  const secret = `${environment === "live" ? PREFIX_LIVE : PREFIX_TEST}${randomBytes(SECRET_BYTES).toString("base64url")}`;
  return {
    secret,
    hash: hashApiKey(secret),
    display: displayHint(secret),
    environment,
  };
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex");
}

/**
 * What a customer sees in the key list.
 *
 * The prefix plus the first few characters of the secret. Deliberately the
 * *start* rather than the end: the start is what appears in a truncated log
 * line or an error message a customer might paste, so it is what they can
 * actually match against.
 */
export function displayHint(secret: string): string {
  const value = secret.trim();
  const prefix = value.startsWith(PREFIX_TEST) ? PREFIX_TEST : PREFIX_LIVE;
  const body = value.slice(prefix.length);
  return `${prefix}${body.slice(0, DISPLAY_CHARS)}...`;
}

export function environmentOf(secret: string): KeyEnvironment | null {
  const value = secret.trim();
  if (value.startsWith(PREFIX_LIVE)) return "live";
  if (value.startsWith(PREFIX_TEST)) return "test";
  return null;
}

/** Shape check before any lookup, so a malformed header costs no database read. */
export function looksLikeApiKey(secret: string): boolean {
  const value = String(secret ?? "").trim();
  if (environmentOf(value) === null) return false;
  const prefix = value.startsWith(PREFIX_TEST) ? PREFIX_TEST : PREFIX_LIVE;
  const body = value.slice(prefix.length);
  // base64url of 32 bytes is 43 characters. Exact, so a truncated or padded
  // value is rejected here rather than producing a hash that misses.
  return /^[A-Za-z0-9_-]{43}$/.test(body);
}

/**
 * Constant-time equality for two hex hashes.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a
 * timing signal and an unhandled exception, so lengths are compared first and
 * the buffers are only handed over when they match.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Extract a key from an Authorization header.
 *
 * Bearer only. Accepting the key as a query parameter would put a live
 * credential in every access log, proxy log, and browser history along the way.
 */
export function apiKeyFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  return looksLikeApiKey(match[1]) ? match[1] : null;
}

/**
 * Whether a key's scopes permit an operation.
 *
 * Deny by default, and a write scope does not imply its read. Those are two
 * separate grants because a customer handing an integration `leads:write` to
 * push contacts in has not thereby agreed to let it read their whole list back
 * out, and quietly bundling the two would make the narrower grant impossible to
 * express.
 */
export function hasScope(granted: readonly string[], required: ApiScope): boolean {
  if (!Array.isArray(granted)) return false;
  return granted.includes(required);
}

export function describeScopes(granted: readonly string[]): string {
  const known = API_SCOPES.filter((scope) => granted.includes(scope));
  if (known.length === 0) return "No access";
  if (known.length === API_SCOPES.length) return "Full access";
  return known.join(", ");
}

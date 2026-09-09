/**
 * Clean up a pasted `__session` value, and refuse an obviously broken one.
 *
 * A session cookie is a thousand characters of base64 that nobody types by
 * hand, so it always arrives by paste — and a paste carries whatever surrounded
 * it: the angle brackets from a placeholder, a stray quote, a newline off the
 * clipboard. Any of those makes Firebase reject a token that is otherwise
 * perfectly good, and the audit then spends ten minutes reporting that every
 * guarded route redirected to the marketing page instead of measuring the
 * screens you asked about.
 *
 * So strip the wrapping, and say plainly at startup when what is left is not a
 * JWT rather than proving it the slow way. The value itself is never echoed:
 * it signs its holder in as that account until it expires.
 */

/** Three dot-separated base64url segments — the shape of any JWT. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Pairs a paste picks up from around a placeholder. */
const WRAPPERS = [
  ["<", ">"],
  ['"', '"'],
  ["'", "'"],
  ["`", "`"],
];

/**
 * @param {string | null | undefined} raw
 * @returns {{ value: string | null }}
 * @throws {Error} when a non-empty value is not a JWT.
 */
export function readCookie(raw) {
  if (raw == null) return { value: null };

  let value = String(raw).trim();
  for (let peeled = true; peeled; ) {
    peeled = false;
    for (const [open, close] of WRAPPERS) {
      if (value.length > 1 && value.startsWith(open) && value.endsWith(close)) {
        value = value.slice(1, -1).trim();
        peeled = true;
      }
    }
  }

  if (value === "") return { value: null };

  if (!JWT.test(value)) {
    throw new Error(
      "AUDIT_COOKIE is not a session cookie: expected three dot-separated " +
        `base64url segments, got ${value.split(".").length} segment(s) across ` +
        `${value.length} characters. Paste the __session value only — no ` +
        "surrounding angle brackets, quotes or spaces."
    );
  }

  return { value };
}

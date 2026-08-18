/**
 * Is this hostname one our server may be asked to reach?
 *
 * These rules were written once, for outbound webhooks, and are now needed a
 * second time: brand-voice autofill fetches a company's own website, which is
 * the same dangerous shape. A request *our server* makes to an address *the
 * customer chooses* is textbook server-side request forgery. The customer does
 * not need to reach our private network themselves, they only need to persuade
 * us to reach it for them and hand back what we found.
 *
 * On Google Cloud the prize is `169.254.169.254`, the metadata server: a GET to
 * it from inside a Cloud Run instance returns service-account access tokens.
 *
 * The rules live here rather than being copied because a second copy is how two
 * validators drift, and the one that drifts is the one nobody was thinking
 * about. What is deliberately *not* here is the wording. A rejection reason is
 * a `kind`, and each caller turns it into a sentence that makes sense where it
 * appears: telling someone pasting their company website that "webhook URLs must
 * use https" is how a correct rule reads as a broken product.
 *
 * A hostname still resolves at request time, so DNS rebinding remains possible
 * in principle: nothing here can promise a name that looks public will not
 * resolve to a private address a moment later. That residual risk belongs to
 * whoever makes the outbound request, and is documented at those call sites.
 */

export type HostRejection =
  | "EMPTY"
  | "IP_LITERAL"
  | "BLOCKED_HOST"
  | "NO_DOT"
  | "NON_ASCII";

/**
 * One numeric component of an address, in any notation `inet_aton` accepts:
 * decimal (`169`), octal via a leading zero (`0251`), or hex (`0xa9`).
 */
const NUMERIC_PART = /^(?:0x[0-9a-f]+|\d+)$/i;

/**
 * Whether a hostname is an IPv4 address in any spelling.
 *
 * Written as a parser rather than a regex because the regex version had a hole,
 * found by a test rather than by reading it. The old pair was
 * `/^\d{1,3}(\.\d{1,3}){3}$/` for dotted form and `/^(0x[0-9a-f]+|0[0-7]+|\d+)$/`
 * for the single-number forms, and `0251.0376.0251.0376` matched neither: the
 * four-digit `0251` is too long for `\d{1,3}`, and the second pattern allows no
 * dots. That string is dotted-octal for 169.254.169.254, and `inet_aton`, which
 * is what the resolver underneath `fetch` ultimately uses, resolves it happily.
 * So the metadata server was reachable through a validator written specifically
 * to block it.
 *
 * The rule that closes it is simpler than enumerating notations: a hostname
 * whose dot-separated parts are *all* numeric in some base is an address, never
 * a name. Two parts count, because `1.2` is a valid spelling of 1.0.0.2. A real
 * domain always has a non-numeric label somewhere, since no TLD is a number.
 */
function isIpv4AnyNotation(host: string): boolean {
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => NUMERIC_PART.test(part));
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".invalid",
  ".example",
];

/**
 * Normalize a hostname the way both callers need it: lowercased, with the
 * trailing root dot removed so `example.com.` cannot sidestep a suffix check.
 */
export function normalizeHost(hostname: string): string {
  return String(hostname ?? "").toLowerCase().replace(/\.$/, "");
}

/**
 * The safety verdict for an already-normalized hostname. Returns null when the
 * host is acceptable, or the reason it is not.
 */
export function rejectPublicHost(host: string): HostRejection | null {
  if (!host) return "EMPTY";

  // IPv6 literals arrive bracketed and URL strips the brackets into hostname,
  // so a colon at this point means an address rather than a name.
  if (host.includes(":")) return "IP_LITERAL";

  // Every notation, not just dotted-decimal. Blocking `169.254.169.254` while
  // allowing `0xa9fea9fe`, `2852039166`, `0251.0376.0251.0376`, or
  // `[::ffff:169.254.169.254]` would be theatre: all resolve to the same host.
  if (isIpv4AnyNotation(host)) return "IP_LITERAL";

  if (BLOCKED_HOSTNAMES.has(host)) return "BLOCKED_HOST";
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "BLOCKED_HOST";

  // A name with no dot cannot be a public DNS name, and is how an internal
  // service is usually addressed.
  if (!host.includes(".")) return "NO_DOT";

  if (/[^\x20-\x7e]/.test(host)) return "NON_ASCII";

  return null;
}

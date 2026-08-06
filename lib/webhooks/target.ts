/**
 * Validating a customer-supplied webhook URL.
 *
 * This is the most dangerous input in the API-and-webhooks feature, and it does
 * not look dangerous at all. An outbound webhook is a request *our server*
 * makes to an address *the customer chooses*, which is the textbook shape of
 * server-side request forgery: the customer does not need to reach our private
 * network, they only need to convince us to reach it for them and hand back
 * what we find.
 *
 * On Google Cloud the specific prize is `169.254.169.254`, the metadata server.
 * A GET to it from inside a Cloud Run instance returns service-account access
 * tokens. A webhook pointed there, with the response echoed into a delivery log
 * the customer can read, is a complete compromise of the runtime identity.
 *
 * So the rules are deny-by-default and deliberately blunt:
 *
 * - **https only.** A plaintext webhook leaks its signed payload in transit.
 * - **no credentials in the URL**, since they would be logged.
 * - **no IP literals at all**, in any notation. Blocking `169.254.169.254`
 *   while allowing `0xa9fea9fe`, `2852039166`, or `[::ffff:169.254.169.254]`
 *   would be theatre; the decimal, octal, hex, and IPv6-mapped spellings all
 *   resolve to the same host.
 * - **no localhost or private-looking names**, and no bare hostname without a
 *   dot, which is how an internal service is usually addressed.
 *
 * A hostname still resolves at request time, so DNS rebinding remains possible
 * in principle: nothing here can promise that a name which looks public will
 * not resolve to a private address later. That residual risk is documented at
 * the delivery site, where the outbound request is actually made.
 */

export interface TargetVerdict {
  ok: boolean;
  /** Normalized absolute URL. Empty when not ok. */
  url: string;
  reason: string;
}

/** Any spelling of an IP address, which is never an acceptable webhook target. */
const IPV4_DOTTED = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV4_ANY_NOTATION = /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i;

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

export function validateWebhookTarget(raw: string): TargetVerdict {
  const fail = (reason: string): TargetVerdict => ({ ok: false, url: "", reason });
  const value = String(raw ?? "").trim();
  if (!value) return fail("Enter the URL Cadence should POST to.");
  if (value.length > 2000) return fail("That URL is too long.");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("That is not a valid URL. Include https:// at the start.");
  }

  if (parsed.protocol !== "https:") {
    return fail("Webhook URLs must use https, so the signed payload is not readable in transit.");
  }
  if (parsed.username || parsed.password) {
    return fail("Remove the username and password from the URL. Use the signing secret instead.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return fail("That URL has no hostname.");

  // IPv6 literals arrive bracketed and URL strips the brackets into hostname.
  if (host.includes(":")) {
    return fail("Use a hostname rather than an IP address.");
  }
  // Every notation, not just dotted-decimal. See the module comment.
  if (IPV4_DOTTED.test(host) || IPV4_ANY_NOTATION.test(host)) {
    return fail("Use a hostname rather than an IP address.");
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return fail("That host is not reachable from Cadence. Use a public hostname.");
  }
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return fail("That host is not reachable from Cadence. Use a public hostname.");
  }
  // A name with no dot cannot be a public DNS name and is how internal
  // services are usually addressed.
  if (!host.includes(".")) {
    return fail("Use a full public hostname, such as hooks.yourcompany.com.");
  }
  if (/[^\x20-\x7e]/.test(host)) {
    return fail("Convert an international domain to its punycode (xn--) form first.");
  }

  // Rebuilt from the parsed URL rather than passed through, so nothing outside
  // scheme, host, port, path, and query survives.
  parsed.hash = "";
  return { ok: true, url: parsed.toString(), reason: "" };
}

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
 * So the rules are deny-by-default and deliberately blunt. Two are specific to
 * webhooks and stay here:
 *
 * - **https only.** A plaintext webhook leaks its signed payload in transit.
 * - **no credentials in the URL**, since they would be logged.
 *
 * The host rules (no IP literal in any notation, no localhost or private-looking
 * name, no bare hostname without a dot) moved to lib/net/publicHost.ts when
 * brand-voice autofill needed the same protection for a customer-supplied
 * website. They are shared rather than copied because a second copy is how two
 * validators drift apart, and the messages below stay here because the wording
 * only makes sense for a webhook field.
 *
 * A hostname still resolves at request time, so DNS rebinding remains possible
 * in principle: nothing here can promise that a name which looks public will
 * not resolve to a private address later. That residual risk is documented at
 * the delivery site, where the outbound request is actually made.
 */

import { normalizeHost, rejectPublicHost } from "@/lib/net/publicHost";

export interface TargetVerdict {
  ok: boolean;
  /** Normalized absolute URL. Empty when not ok. */
  url: string;
  reason: string;
}

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

  // The rules are shared with brand-voice autofill; the sentences are not. Each
  // rejection kind is turned into wording that makes sense in a webhook field.
  const host = normalizeHost(parsed.hostname);
  const rejection = rejectPublicHost(host);
  if (rejection) {
    return fail(
      {
        EMPTY: "That URL has no hostname.",
        IP_LITERAL: "Use a hostname rather than an IP address.",
        BLOCKED_HOST: "That host is not reachable from Cadence. Use a public hostname.",
        NO_DOT: "Use a full public hostname, such as hooks.yourcompany.com.",
        NON_ASCII: "Convert an international domain to its punycode (xn--) form first.",
      }[rejection]
    );
  }

  // Rebuilt from the parsed URL rather than passed through, so nothing outside
  // scheme, host, port, path, and query survives.
  parsed.hash = "";
  return { ok: true, url: parsed.toString(), reason: "" };
}

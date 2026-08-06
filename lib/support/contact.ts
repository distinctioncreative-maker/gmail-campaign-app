/**
 * The support path.
 *
 * Until now a customer whose campaign stopped mid-send had nowhere to go: no
 * address, no form, no route. Grepping for `support@` returned one comment in
 * the pricing table. That is a blocker on charging money, not a nicety, and it
 * is also the difference between a bug that gets reported once and a bug that
 * quietly ends a subscription.
 *
 * Two paths, because they fail at different times:
 *
 * - Signed in: a form that attaches the diagnostic context automatically. Most
 *   of a support round trip is spent asking which workspace, which campaign,
 *   test or live, Gmail connected or not. The customer already told us all of
 *   that by being signed in, so asking again is the product wasting their time.
 * - Signed out or locked out: a plain address on a public page. Someone who
 *   cannot authenticate cannot use an authenticated form, which is exactly the
 *   moment they most need to reach a human.
 *
 * This module is deliberately pure and shared: no `server-only`, no env read,
 * no Firestore. The address is passed in from the server so a client component
 * can render it without leaking anything else about the environment.
 */

export const SUPPORT_CATEGORIES = [
  "SENDING",
  "DELIVERABILITY",
  "ACCOUNT_ACCESS",
  "BILLING",
  "DATA_PRIVACY",
  "BUG",
  "OTHER",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

interface CategoryCopy {
  label: string;
  /** What to include, so the first reply can be an answer rather than a question. */
  hint: string;
}

const CATEGORY_COPY: Record<SupportCategory, CategoryCopy> = {
  SENDING: {
    label: "Sending or campaigns",
    hint: "Name the campaign and roughly when it stopped or misbehaved.",
  },
  DELIVERABILITY: {
    label: "Deliverability or spam placement",
    hint: "Include the sending domain and whether anything changed recently.",
  },
  ACCOUNT_ACCESS: {
    label: "Signing in or account access",
    hint: "Tell us the email address you sign in with and what you see instead.",
  },
  BILLING: {
    label: "Billing or plan",
    hint: "Include the invoice or the date of the charge if there is one.",
  },
  DATA_PRIVACY: {
    label: "Data, privacy, or deletion",
    hint: "Say what you want done with the data so we can act on it directly.",
  },
  BUG: {
    label: "Something is broken",
    hint: "What you did, what happened, and what you expected instead.",
  },
  OTHER: {
    label: "Something else",
    hint: "Whatever is on your mind. We would rather hear it than not.",
  },
};

export function describeCategory(category: SupportCategory): string {
  return CATEGORY_COPY[category].label;
}

export function categoryHint(category: SupportCategory): string {
  return CATEGORY_COPY[category].hint;
}

export function supportCategoryOptions(): Array<{ value: SupportCategory; label: string }> {
  return SUPPORT_CATEGORIES.map((value) => ({ value, label: describeCategory(value) }));
}

/**
 * The reference a customer quotes back at us.
 *
 * Crockford's alphabet without I, L, O, or U, so a reference read down a phone
 * or retyped from a screenshot cannot become a different valid reference. The
 * caller supplies the randomness; this stays pure and therefore testable.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function supportReference(randomHex: string): string {
  const clean = randomHex.replace(/[^0-9a-f]/gi, "");
  if (clean.length < 8) throw new Error("supportReference needs at least 8 hex characters");
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    // Two hex digits (0-255) folded into one alphabet symbol.
    out += ALPHABET[parseInt(clean.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length];
  }
  return `CDN-${out}`;
}

/**
 * A mailto for the signed-out path, with the subject and reference prefilled.
 *
 * Every field is encoded: an address or subject carrying a newline could
 * otherwise inject extra mail headers into the customer's own client.
 */
export function supportMailto(
  address: string,
  opts: { subject?: string; reference?: string } = {}
): string {
  const subject = opts.subject?.trim() || "Cadence support";
  const params = new URLSearchParams({ subject });
  if (opts.reference) params.set("body", `Reference: ${opts.reference}\n\n`);
  return `mailto:${encodeURIComponent(address)}?${params.toString()}`;
}

/** What we tell people to expect. Stated once, so the app cannot contradict itself. */
export const SUPPORT_RESPONSE_TARGET = "one business day";

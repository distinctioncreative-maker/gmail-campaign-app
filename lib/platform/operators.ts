/**
 * Who operates the platform, as opposed to who administers a workspace.
 *
 * **This distinction is the whole security model, and conflating the two would
 * be catastrophic.** `role: "ADMIN"` in this product means "admin of one
 * customer's workspace", and `lib/auth/requireUser.ts` makes the first member of
 * every new organization an ADMIN automatically. So gating platform powers on
 * `role === "ADMIN"` would hand every customer who ever signs up the ability to
 * suspend other customers, read cross-tenant data, and change pricing. There is
 * no warning anywhere that would catch that: the code would look exactly like
 * every other admin-gated route in the app.
 *
 * Hence a separate identity list that no role, no membership, and no workspace
 * can grant.
 *
 * **The list is an environment variable and deliberately not a database
 * collection.** Every other privilege in this product is stored in Firestore,
 * which is correct for privileges that customers manage. This one is different
 * because it is the floor under everything else: if the operator list were
 * writable from inside the app, then a Firestore rules mistake, a compromised
 * service account, or a single bad write path would escalate to total control of
 * every tenant. Keeping it in the deployment configuration means the worst case
 * for an in-app compromise stays bounded, and changing the list requires access
 * to Cloud Run, which is a different credential entirely.
 *
 * The cost is that adding an operator needs a deploy. For a list with one to
 * three names on it, that is a feature.
 *
 * Pure, so the matching rules are testable without a session.
 */

/** Parse the configured list. Comma or whitespace separated, case-insensitive. */
export function parseOperatorEmails(raw: string): string[] {
  return String(raw ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    // Anything without an @ is a configuration mistake, not an operator. A
    // typo'd entry must not become a wildcard.
    .filter((entry) => entry !== "" && entry.includes("@") && !entry.startsWith("@"));
}

/**
 * Whether this email operates the platform.
 *
 * Exact match on the full address. Domain matching is deliberately not
 * supported: "anyone at my company" is how an operator list quietly grows to
 * include a contractor's account, and the blast radius here is every customer's
 * data.
 */
export function isPlatformOperator(email: string, configured: string): boolean {
  const candidate = String(email ?? "").trim().toLowerCase();
  if (candidate === "" || !candidate.includes("@")) return false;
  return parseOperatorEmails(configured).includes(candidate);
}

/** Whether a platform portal exists on this deployment at all. */
export function platformConfigured(configured: string): boolean {
  return parseOperatorEmails(configured).length > 0;
}

/**
 * Actions that need recent proof of identity, not just a valid session.
 *
 * A session cookie lasts five days. That is fine for reading a dashboard and
 * wrong for suspending a customer or opening signup to the public, because a
 * borrowed laptop is then five days of platform control. These actions require a
 * sign-in within the step-up window.
 */
export const STEP_UP_ACTIONS = [
  "workspace.suspend",
  "workspace.unsuspend",
  "identity.ban",
  "identity.unban",
  "signup.mode",
  "plan.override",
  "plan.override_cleared",
  // Every one of these changes what the platform does for every customer at
  // once. Halting sending is the heaviest control in the product, and read-only
  // mode stops work in progress across every workspace; a banner is milder but
  // it speaks to all customers in our name. None of them is a read.
  "readonly.mode",
  "sending.halted",
  "notice.banner",
] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

/** How recently the operator must have actually signed in. */
export const STEP_UP_WINDOW_MS = 30 * 60 * 1000;

export function needsStepUp(action: string): boolean {
  return (STEP_UP_ACTIONS as readonly string[]).includes(action);
}

/**
 * Whether the session is fresh enough for a destructive action.
 *
 * `authTimeSeconds` comes from the Firebase session cookie's `auth_time` claim,
 * which records when the person actually authenticated rather than when the
 * cookie was last accepted. A missing or unreadable value fails closed: an
 * unknown authentication time is not a recent one.
 */
export function stepUpSatisfied(
  authTimeSeconds: number | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const authTime = Number(authTimeSeconds);
  if (!Number.isFinite(authTime) || authTime <= 0) return false;
  const age = nowMs - authTime * 1000;
  // A future auth_time means a clock problem somewhere, and trusting it would
  // make the window infinite.
  if (age < -60_000) return false;
  return age <= STEP_UP_WINDOW_MS;
}

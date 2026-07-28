# Security

## Identity and sessions

- App sign-in: Firebase Auth (Google provider). The client obtains an ID
  token; the server exchanges it for an **HttpOnly, Secure, SameSite=Lax
  session cookie** (`lib/auth/session.ts`). Client-provided user IDs are
  never trusted.
- Workspace restriction: the email domain is always checked against
  `ALLOWED_GOOGLE_WORKSPACE_DOMAIN`, and the `hd` claim is additionally
  validated when present (`hd` alone is never sufficient).
- Organization membership is re-verified server-side on every request via
  `requireUser()`; disabled members are rejected. First-admin provisioning,
  user creation, invite consumption, and organization bootstrap use
  transactions or create-if-absent semantics to close concurrent-signup
  races.
- Session creation is rate-limited with a fail-closed Firestore-backed key.

## Data isolation

- All user data lives under `users/{userId}/…` — the owner is part of the
  document path, so repository queries cannot cross users.
- Every record carries `organizationId` + `ownerUserId`; both derive from
  the verified session, never from request bodies.
- Firestore Security Rules (defense-in-depth, `firestore.rules`): writes are
  server-only; reads only for `request.auth.uid == userId`; Gmail
  connections, queue internals, collision hashes, and org settings are
  never client-readable.

## Gmail tokens

- Connect flow is separate, incremental OAuth with offline access.
- Refresh tokens are encrypted with **Cloud KMS** before storage
  (`lib/kms/crypto.ts`); production refuses to run on the local-dev cipher.
- Decryption happens only inside `lib/gmail/client.ts`; tokens are never
  logged and never returned by any API (`GmailConnectionPublic` omits the
  field by construction).
- Disconnect revokes the Google grant and overwrites the stored ciphertext.
- The OAuth callback is CSRF-protected by a signed, 10-minute state JWT
  bound to the signed-in user.

## Outbound email safety

See CAMPAIGN_SAFETY.md. Summary: a single choke point
(`applySendSafety`) forces all mail to the configured test destination with
a `[TEST]` subject while the organization is in TEST mode. Organizations
default to TEST; `FORCE_TEST_MODE=true` is a deployment-level emergency
lock. Explicit self-tests may use only the server-verified signed-in email.

- Campaign launch is transactionally claimed and uses deterministic queue
  IDs, so double-clicks cannot create duplicate work.
- Daily quota and delivery intent are reserved in Firestore transactions
  immediately before Gmail. Failures after the Gmail boundary are marked
  `AMBIGUOUS`, never automatically retried.
- Draft-only campaigns call Gmail Drafts and never increment sent metrics,
  consume send quota, or create follow-ups.
- Cloud Tasks and Cloud Scheduler routes verify OIDC before doing work.

## Input validation and output

- Request bodies are validated with Zod; Firestore domain reads are
  re-validated against schemas.
- Placeholder values are HTML-escaped, saved signatures are sanitized, and
  the final rendered email is sanitized again before preview or delivery.
  Browser previews run in a sandboxed iframe.
- Public tracking tokens are signed and expire after 90 days. Tracking
  endpoints are rate-limited, counters are transactional, and click
  redirects accept only stored HTTP(S) destinations.
- Auth, waitlist, tracking, and interactive AI endpoints have bounded,
  fail-closed rate limits.
- Errors returned to clients are friendly strings. Structured log and alert
  payloads redact emails, bearer values, API keys, and token-like fields.

## Billing integrity

- Stripe signatures support key rotation and a five-minute replay window.
- Webhook event IDs are transactionally claimed; transient failures return
  non-2xx so Stripe retries.
- Event creation time plus event-type priority prevents stale subscription
  updates from restoring canceled access.
- Checkout will not create a second active subscription and cannot purchase
  fewer Team seats than active members; Team defaults to at least two seats.
- For Stripe-backed Team/Enterprise workspaces, active members plus pending
  invites reserve purchased seats. Invite and reactivation checks run inside
  Firestore transactions, so concurrent admin requests cannot oversubscribe.
  Legacy workspaces without a Stripe subscription remain grandfathered.
- Subscription updates read the current Stripe line-item quantity rather than
  stale checkout metadata.

## Verification and remaining external work

- Firestore emulator isolation tests run in GitHub Actions on Java 21.
- Google OAuth verification/CASA, production Stripe key validation, uptime
  monitoring, legal review, and cloud backup policy remain launch operations,
  not controls that source code alone can complete.

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
  `requireUser()`; disabled members are rejected.

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
(`applySendSafety`) forces all mail to the configured test destination
with a `[TEST]` subject unless `TEST_MODE=false` is set explicitly.

## Input validation and output

- All request bodies validated with Zod; all Firestore reads re-validated
  against schemas.
- Errors returned to clients are friendly strings; stack traces stay in
  server logs (`lib/api.ts`), with token values never logged.

## Still to come (later phases)

- Cloud Tasks OIDC verification for worker endpoints
- Rate limiting on auth endpoints
- Audit events for destructive/override actions
- HTML sanitization for pasted templates
- Firestore emulator tests proving cross-user reads fail

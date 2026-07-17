# Incident Response

## Emails going to real recipients unexpectedly

1. Set `TEST_MODE=true` on the Cloud Run service and redeploy
   (fastest global stop — the safety gate then redirects everything).
2. Verify no worker path bypassed `applySendSafety` (there should be
   exactly one call site: `lib/gmail/send.ts`).
3. Review Gmail Sent folders of affected users for scope of exposure.

## Suspected token compromise

1. Rotate the KMS key version
   (`gcloud kms keys versions create … --primary`); old ciphertexts still
   decrypt, new writes use the new version.
2. Force reconnect: set `status: NEEDS_RECONNECT` on affected
   `gmailConnections` docs; users re-consent and `tokenVersion`
   increments.
3. If the OAuth client secret leaked: rotate it in the Cloud Console,
   update Secret Manager, redeploy — all existing refresh tokens keep
   working (they're bound to the client ID, not the secret), but
   revoke-and-reconnect is the conservative option.

## Wrong person seeing data (isolation report)

1. Treat as sev-1. Capture the exact URL/API call and both user IDs.
2. Check the route's use of `requireUser()` — data access must flow
   through `AuthContext`-scoped repositories only.
3. Check `firestore.rules` deploy state matches the repo.
4. Preserve Cloud Run logs for the window before any restart.

## App down / sign-in failing

- Cloud Run revision healthy? Roll back to the previous revision.
- Firebase Auth outage? status.firebase.google.com.
- Domain restriction misconfigured (`ALLOWED_GOOGLE_WORKSPACE_DOMAIN`
  typo) locks everyone out — fix env and redeploy.

## Contact

Escalate to the application admin (first ADMIN member) and your Google
Workspace administrator for OAuth/consent issues.

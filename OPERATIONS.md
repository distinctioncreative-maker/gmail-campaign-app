# Operations

## Routine checks

- **Gmail token health**: `users/*/gmailConnections/primary` documents with
  `status: NEEDS_RECONNECT` mean the user must reconnect; the dashboard
  surfaces this to them. A spike suggests an OAuth config problem.
- **Logs**: Cloud Run logs are structured; API errors log name/message
  only (no tokens, no email bodies). Filter on `[api] unhandled error`.

## Adding a salesperson

1. They open the app URL and sign in with their Workspace account —
   membership is provisioned automatically as `SALES_REP`.
2. An admin can later change roles (admin UI ships in phase 6; until
   then, edit `organizations/default/members/{userId}.role`).

## Offboarding a user

1. Set `active: false` on `organizations/default/members/{userId}` and
   `users/{userId}` — every request is rejected from that moment.
2. Their Gmail grant: revoke from the app (Disconnect) or the user's
   Google Account security page. Deleting the
   `gmailConnections/primary` doc removes the stored ciphertext.
3. Data deletion on request: delete the `users/{userId}` subtree.

## Known operational notes

- First sign-in ever becomes ADMIN (bootstrap rule) — do this yourself
  before inviting the team.
- Firestore is the source of truth; there are no cron jobs yet.
  Cloud Scheduler sweeps arrive with phases 4–5.
- System Health admin page ships in phase 6; until then use the Cloud
  Console (Run metrics, Firestore usage, Tasks queue depth).

## Incident quick reference

See INCIDENT_RESPONSE.md.

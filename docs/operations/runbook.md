# Operations

## Routine checks

- **Gmail token health**: `users/*/gmailConnections/primary` documents with
  `status: NEEDS_RECONNECT` mean the user must reconnect; the dashboard
  surfaces this to them. A spike suggests an OAuth config problem.
- **Logs**: Cloud Run logs are structured and redact email addresses,
  bearer values, keys, and tokens. Filter on the `scope` field.
- **Scheduler health**: the System Health page records sweep freshness;
  confirm reply, bounce, repair, metrics, and benchmark jobs are running.
- **Ambiguous delivery**: queue items marked `AMBIGUOUS` may have reached
  Gmail. Inspect Sent/Drafts before taking manual action; never blindly
  requeue them.
- **Durable task outbox**: `SCHEDULED` queue items with
  `cloudTaskName: null` are expected briefly after a publication failure and
  for work more than 29 days away. The hourly repair sweep publishes them
  when eligible. A growing near-term backlog means the repair job, Tasks
  permissions, or queue configuration needs attention.

## Adding a salesperson

1. An admin creates an invite when the Team plan permits it. For a
   Stripe-backed workspace, active members plus pending invites cannot exceed
   purchased seats.
2. The user signs in with the invited email and is provisioned into the
   correct organization with the invited role.
3. Admins can change role or active state from the Administration page.
   Reactivation also requires an available purchased seat.

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
- Firestore is the source of truth; Cloud Scheduler invokes OIDC-protected
  sweep routes and Cloud Tasks drives message work.
- The System Health page complements Cloud Run metrics, Firestore usage,
  Scheduler execution logs, and Tasks queue depth in Cloud Console.

## Incident quick reference

See docs/operations/incident-response.md.

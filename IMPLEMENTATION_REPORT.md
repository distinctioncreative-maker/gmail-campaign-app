# Implementation Report

Multi-user Gmail outreach platform for a non-technical sales team, built to
the master specification. Live at
`https://outreach-616949765761.us-central1.run.app` (project
`email-tool-502714`, org `alpinefundings.com`).

## Architecture summary

Standalone Next.js 16 (App Router, TypeScript strict) app on Cloud Run.
Firestore is the system of record. Two separate Google authorization
layers: Firebase Auth for app sign-in (Workspace-domain restricted) and a
distinct incremental OAuth flow for connecting each user's Gmail. Cloud
Tasks drives all scheduled sends (one durable task per message); Cloud
Scheduler runs periodic reply/bounce/repair sweeps. Refresh tokens are
envelope-encrypted with Cloud KMS. There is no Apps Script anywhere and no
shared mailbox — every email sends through the connecting salesperson's own
Gmail.

## Features completed (by spec section)

- **§3 Isolation / §27 rules** — every record carries `organizationId` +
  `ownerUserId`; the owner is in the Firestore document path; server
  repositories are the only mutation path; security rules deny cross-user
  reads and never expose Gmail tokens/queues (proven by emulator tests).
- **§4 Team collision** — optional org policy with an HMAC-SHA256 digest
  keyed by a KMS-encrypted org secret; OFF / PRIVATE_WARNING /
  MANAGER_VISIBLE / BLOCK_RECENT. Reps never see other reps' identities.
- **§6 Onboarding** — 6-step wizard ending in a real self-test email.
- **§7 OAuth** — internal consent, domain allowlist (email + `hd`),
  incremental Gmail scopes (`gmail.compose` + `gmail.readonly`).
- **§9 Imports** — Salesforce paste parser (pattern-first, missing
  fields never shift others) and CSV import with auto/manual column
  mapping; shared preview + exclusion workflow.
- **§10 Duplicate/prior detection** — classification at import and again
  at launch; opt-outs/unsub/bounce/suppressed always excluded; prior
  contacts pre-deselected and policy-gated.
- **§11 Templates** — visual editor, starter layouts, paste HTML
  (sanitized), Gmail-draft import; 17 placeholders, unresolved detection,
  previews, versioning, test send.
- **§12–14 Campaigns/engine** — 8-step wizard; Cloud Tasks with
  precomputed randomized timestamps; deterministic idempotency keys
  reserved transactionally; pre-send eligibility re-check; window + daily
  cap rollovers; full pause/resume/stop/cancel/cancel-delete-drafts/
  send-next-batch/retry/skip/clone controls.
- **§15 Follow-ups** — reusable sequence builder; next step computed only
  after a confirmed send; threaded replies; stop-on-reply/bounce/unsub;
  OOO policy.
- **§16–17 Reply/bounce** — header-first reply classification (never
  subject-only); mailer-daemon bounce parsing (hard/soft); suppression on
  unsubscribe and hard bounce; Cloud Scheduler sweeps.
- **§18 Suppressions** — checked at import, launch, and before every
  send; manual/bulk/CSV add; removal requires a reason (+admin for org
  scope); never auto-unsuppressed.
- **§21 Reports / §22 Test Center / §23 Notifications / §25 System
  Health** — all built; §24 auto-pause on Gmail loss / missing template /
  repeated errors.

## Security & data-isolation controls

TypeScript strict; Zod on all input; HTML sanitized; HttpOnly/Secure/
SameSite session cookies; session + org membership verified server-side on
every request; owner IDs never trusted from the client; KMS-encrypted
refresh tokens never returned to the client; Cloud Tasks/Scheduler workers
verify Google OIDC identity; friendly errors only (no stack traces or token
logging). Firestore emulator suite proves user A cannot read user B's data
and that Gmail connections/queues are never client-readable.

## Google Cloud resources required

Cloud Run, Firestore (native), Cloud Tasks (`campaign-sends`), Cloud
Scheduler (reply/bounce/repair/metrics), Secret Manager, Cloud KMS
(token key), Firebase Auth, Artifact Registry, Cloud Build. Two service
accounts (runtime + tasks invoker), least-privilege IAM. See
`scripts/setup-cloud.sh` and DEPLOYMENT.md.

## OAuth scopes and justification

`openid email profile` (sign-in only); `gmail.compose` (create/send drafts
as the user — narrower than modify/full mail); `gmail.readonly` (read
thread metadata + bodies for reply/bounce detection). Sheets/Drive scopes
are not requested (Sheet import deferred).

## Verification performed

`npm test` — 109 unit tests green (parser fixtures, normalization, KMS
boundary, send-safety override, scheduling windows/rollovers, eligibility,
personalization, HTML sanitization, reply/bounce classification, collision
HMAC, CSV mapping). `npm run test:emulator` — 6 Firestore isolation tests
green (and caught a real rules bug: a broad wildcard was OR-granting reads
that a separate deny block could not revoke — fixed). `tsc --noEmit`, ESLint,
and `next build` all clean.

## Configuration still needed for real sending

`TEST_MODE=true` throughout — flip to `false` only as a deliberate, reviewed
step. Run `scripts/setup-cloud.sh` to wire Cloud Tasks + Scheduler (until
then campaigns create recipients but note that background sending isn't
configured). Set `TEST_EMAIL_DESTINATION`.

## Known limitations

- Gmail-based bounce detection is less comprehensive than a dedicated ESP.
- Google Sheet import + audit-mirror spreadsheet are deferred.
- Open tracking is intentionally not implemented.
- Sweeps enumerate all users; fine at team scale, revisit for very large orgs.

## Recommended next steps

1. Run `setup-cloud.sh`, then a 2-recipient TEST_MODE campaign to your own
   addresses to watch the full pipeline (see the verification list below).
2. Add Google Sheet import + audit mirror when needed.
3. Add Playwright e2e against the emulator in CI.

## End-to-end test walkthrough (all in TEST_MODE)

1. Help → Test Center → Run all checks (connection, test email, parser,
   personalization, reply/bounce detection) → all green.
2. Leads → paste the Salesforce sample / upload a CSV → verify badges and
   opt-out exclusion → import.
3. Templates → new → starter layout → preview → send me a test.
4. Follow-Ups → new sequence (2 steps).
5. Campaigns → new → pick your leads + template + sequence → Balanced →
   Start now → two `[TEST]` emails arrive ~5–10s apart; campaign completes.
6. Re-deliver a completed task to the worker → 200 no-op (idempotency).
7. Second allowlisted user sees none of the first user's data.

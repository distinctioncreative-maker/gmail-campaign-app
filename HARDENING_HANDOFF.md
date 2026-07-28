# Cadence Hardening Handoff

Read this document before modifying the hardening work. It is the durable
handoff between ChatGPT Codex and Claude Code; do not rely on either agent's
chat history.

## Work state

| Item | Value |
|---|---|
| Date | 2026-07-28 |
| Repository | `distinctioncreative-maker/gmail-campaign-app` |
| Base commit | `e8872c6` |
| Working branch | `codex/cadence-hardening` |
| Production service | `outreach`, `us-central1`, project `email-tool-502714` |
| Production owner | Alpine Google Workspace account |
| Push/deploy status | Not pushed and not deployed |
| Baseline before changes | Typecheck, lint, 264 unit tests, and build passed |
| Current local status | Clean install, typecheck, lint, 278 unit tests, production build, docs generation, diff check, shell syntax check, and production audit pass |
| Emulator status | Blocked locally: Java 17 installed; Firebase CLI 15 requires Java 21. GitHub CI installs Temurin 21 and runs it |
| CLI status in this terminal | No global `gcloud`, `firebase`, or `stripe`; repo-local Firebase CLI is installed but not authenticated |

The branch intentionally contains one cohesive hardening pass. Review and
split it into small commits before publishing.

## Why this pass exists

The prior implementation had strong product breadth, but several production
boundaries were not safe under concurrency or untrusted input:

- repeated campaign launch could create duplicate queue work;
- the daily cap was a non-atomic read followed by a later increment;
- a worker failure after calling Gmail could be automatically retried;
- draft-only queue items still flowed through real sending behavior;
- template placeholder values could become executable HTML;
- follow-up pause/cancel state did not always match actual Cloud Tasks;
- open/click counters could lose increments and tracking tokens did not
  expire;
- plan capability checks were inconsistent between navigation, pages, APIs,
  and the worker;
- Stripe webhooks lacked durable event idempotency and robust event ordering;
- organization/admin/invite creation had first-request races;
- CI, Cloud Build service naming, Scheduler setup, and environment docs had
  drifted from the deployed system.

## Non-negotiable invariants

### Authentication and tenancy

1. `requireUser()` never recomputes a returning user's organization from
   their current email domain. The stored user record is authoritative.
2. If that stored organization is missing, access fails closed. A returning
   user must never silently fall into a different tenant.
3. Missing membership in the stored org may be repaired, but membership and
   active status are always checked.
4. Organization bootstrap, first-admin assignment, and user creation are
   transactional/idempotent. Two first sign-ins cannot both become admins.
5. A pending invite pointer cannot be overwritten by another organization.
   Invite consumption/revocation only clears the pointer when it still
   belongs to the same organization.
6. Team and admin access requires both role authorization and
   `capabilitiesFor(tenantType, billing.plan)`. Hiding a navigation item is
   never considered enforcement.
7. A paid Team/Enterprise Stripe subscription with a positive seat quantity
   enforces that quantity transactionally. Active members plus pending
   invitations reserve seats; concurrent invites and member reactivation
   cannot oversubscribe it. Grandfathered workspaces with no Stripe
   subscription remain unrestricted.

Key files:

- `lib/auth/requireUser.ts`
- `lib/repositories/users.ts`
- `lib/repositories/organizations.ts`
- `lib/repositories/invites.ts`
- `lib/tenancy/capabilities.ts`
- `app/api/teams/**`
- `app/api/invites/route.ts`

### Campaign launch

1. Launch is transactionally claimed: only DRAFT/READY may move to
   PREPARING.
2. Recipient and queue document IDs are deterministic, and selected contacts
   are deduplicated by contact ID.
3. Queue/recipient documents are written before publication.
4. The campaign moves to ACTIVE before Cloud Tasks are enqueued. Immediate
   tasks must never observe PREPARING and skip themselves.
5. A failure before ACTIVE conditionally releases PREPARING back to READY.
   Once ACTIVE, recovery is a repair/operations concern and must not recreate
   the launch.
6. Risky pace settings require explicit client acceptance and independent
   server validation. No route or UI action may exceed the stored plan cap.

Key files:

- `app/api/campaigns/route.ts`
- `app/api/campaigns/[campaignId]/launch/route.ts`
- `app/api/campaigns/[campaignId]/control/route.ts`
- `lib/campaigns/launch.ts`
- `lib/repositories/campaigns.ts`
- `components/campaign/CampaignWizard.tsx`
- `components/campaign/CampaignControls.tsx`

### Worker delivery boundary

The worker's safety order is:

1. Verify Cloud Tasks OIDC and claim the queue item.
2. Load campaign, recipient, Gmail connection, and current org plan.
3. Re-check campaign/recipient/suppression/window eligibility.
4. Render and sanitize content.
5. For a real send, transactionally reserve one unit of the effective daily
   cap using the message idempotency key.
6. Transactionally reserve the delivery idempotency key.
7. Set the in-process `reachedDeliveryAttempt` boundary and call Gmail.
8. Atomically finalize the message, recipient, current queue item, campaign
   counter, and durable next-follow-up queue record.
9. Publish the already-durable follow-up to Cloud Tasks, then update
   best-effort projections such as events and contact engagement.

Any existing delivery reservation blocks another Gmail call, regardless of
whether its state is RESERVED, SENT, or DRAFTED. A failure after step 7 is
`AMBIGUOUS`, returns HTTP 200 to Cloud Tasks, and is never auto-retried. An
operator must inspect Gmail Sent/Drafts before deciding what happened.

`repairOwner()` follows the same rule:

- no delivery reservation: a stale PROCESSING item may be requeued;
- RESERVED: mark AMBIGUOUS;
- SENT/DRAFTED: mark COMPLETE.

Do not weaken this behavior to improve apparent retry success. Duplicate
email is the higher-severity failure.

Key files:

- `app/api/tasks/send-message/route.ts`
- `lib/repositories/campaigns.ts`
- `lib/campaigns/repair.ts`
- `schemas/campaign.ts`

### Daily quota

The effective cap is:

```text
min(campaign.schedule.dailySendLimit, PLANS[orgPlan].maxDailySends)
```

`reserveDailySend()` updates the counter and creates a subcollection
reservation in one Firestore transaction. The idempotency-keyed reservation
makes a retry free while concurrent workers cannot collectively exceed the
cap.

When the cap is reached, remaining work is re-spread across the next valid
day. A fallback schedules the current item individually if another worker
won the campaign-wide deferral before this item left PROCESSING.

### Draft-only campaigns

`CREATE_INITIAL_DRAFT` and `CREATE_FOLLOWUP_DRAFT` call Gmail
`drafts.create`, not `messages.send`. A successful draft:

- finalizes the message as DRAFTED with a Gmail draft ID;
- marks the recipient DRAFTED;
- marks the queue item COMPLETE;
- increments drafted count only;
- does not consume daily send quota;
- does not mark the contact emailed;
- does not increment sent/follow-up metrics;
- does not schedule another follow-up.

Key files:

- `lib/gmail/send.ts`
- `app/api/tasks/send-message/route.ts`
- `lib/repositories/campaigns.ts`

### Test-mode safety

All Gmail sends and drafts call `applySendSafety()` inside the Gmail wrapper.
Organization sending mode defaults to TEST. Campaign traffic in TEST always
uses `TEST_EMAIL_DESTINATION`; it cannot accept an arbitrary client target.
Explicit self-test routes may pass only `ctx.email`, which was resolved from
the verified server session.

`FORCE_TEST_MODE=true` is the deployment lock. Legacy `TEST_MODE=true`
continues to lock for compatibility. Do not treat an unset legacy
`TEST_MODE` as LIVE.

### Follow-ups and mailbox attribution

- Pause deletes live Cloud Tasks before leaving queue items SCHEDULED.
- Resume recalculates overdue timestamps and creates new tasks.
- Cancel/stop deletes outstanding task names.
- Out-of-office handling reschedules the actual follow-up tasks to the
  return date.
- FOLLOWUPS_PAUSED is resumable and must not become a terminal queue failure.
- A confirmed Gmail result and its next follow-up queue record commit in one
  Firestore transaction. Failure or process exit while publishing the Cloud
  Task cannot lose the follow-up; the repair sweep publishes records whose
  `cloudTaskName` is missing.
- Cloud Tasks accepts schedule times only 30 days ahead. Cadence keeps a
  29-day safety margin: longer-delay queue records remain durable in
  Firestore and the hourly repair sweep publishes them once eligible.
- Reply and bounce scans search 90 days and choose the most recent preceding
  send when the same email appears in multiple campaigns.
- Reply, unsubscribe, and bounce outcomes are transactionally claimed with
  their campaign/daily counters. Concurrent manual and Scheduler scans cannot
  double-count the same outcome.

Key files:

- `lib/campaigns/controls.ts`
- `lib/campaigns/monitoring.ts`

### HTML and tracking

- `renderHtmlTemplate()` HTML-escapes all contact/sender placeholders.
- The saved signature is sanitized before insertion.
- The fully rendered body is sanitized again before preview or Gmail.
- Campaign preview uses a sandboxed iframe.
- AI reply HTML follows the same escaping/final-sanitization boundary.
- Tracking tokens contain issued/expiry timestamps and are valid for 90
  days. Legacy tokens are accepted only while the referenced initial send
  is within the same 90-day window.
- Open/click endpoints are rate-limited per token.
- Open/click counters are transactional.
- Click redirects accept only stored `http:`/`https:` destinations.

Key files:

- `lib/personalization/render.ts`
- `lib/personalization/preview.ts`
- `lib/sanitize/emailHtml.ts`
- `lib/tracking/token.ts`
- `app/api/t/o/[token]/route.ts`
- `app/api/t/c/[token]/[index]/route.ts`
- `app/api/replies/draft/route.ts`

### Billing

New organizations receive explicit FREE billing state. Existing Workspace
organizations that predate billing state retain the grandfathered TEAM
default.

Stripe rules:

1. Checkout refuses to create a second trialing/active/past-due
   subscription. Existing subscribers use the billing portal.
2. Team checkout defaults to at least two seats and cannot be less than the
   active member count.
3. Plan, organization, and seat metadata are copied to both Checkout and
   the created subscription.
4. Webhook signatures accept any valid `v1` signature in the header, which
   supports signing-secret rotation, and reject timestamps outside five
   minutes.
5. Each Stripe event ID is transactionally claimed. PROCESSED returns 200;
   BUSY returns 409 so Stripe retains a retry; handler failure records FAILED
   and returns 500.
6. Customer ID pointers avoid cross-org scans.
7. Stripe `created` plus event priority prevents stale events from restoring
   old access. Priority is Checkout 1, subscription update 2, deletion 3.
8. Subscription deletion sets plan FREE and clears subscription state.
9. Active members plus pending invitations reserve purchased seats.
   Invitation creation and member reactivation enforce the limit inside
   Firestore transactions; refreshing an existing pending invite does not
   consume a second seat.
10. Subscription-update webhooks prefer the current Stripe line-item
    quantity over checkout metadata, so portal quantity changes do not leave
    Cadence enforcing the original seat count.

Key files:

- `lib/billing/stripe.ts`
- `lib/repositories/billing.ts`
- `lib/repositories/orgSettings.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/billing/webhook/route.ts`
- `components/admin/BillingCard.tsx`

### Rate limits and observability

Firestore-backed rate limits now cover:

- session exchange;
- public waitlist;
- open and click tracking;
- interactive AI generation/improvement/subjects/sequence/reply endpoints.

Public/abuse-sensitive routes use fail-closed behavior. Request keys combine
the external HTTPS load balancer's verified client hop (the second-to-last
`X-Forwarded-For` entry) with user agent; signed-in AI limits also scope by
user. Rate-limit documents carry a Firestore `Timestamp` TTL.

`reportError()` redacts email addresses, bearer values, Google/Stripe-like
keys, and token-like fields before console or webhook output.

## Infrastructure and dependency changes

- `.github/workflows/ci.yml` runs Node 22 and Java 21, then `npm ci`,
  typecheck, lint, unit tests, Firestore emulator tests, build, and
  `npm audit --omit=dev --audit-level=high`.
- `.github/dependabot.yml` monitors npm and GitHub Actions.
- `cloudbuild.yaml` now deploys the real `outreach` service and allows
  unauthenticated service ingress because public landing/auth/health/Stripe/
  tracking routes require it. Sensitive routes authenticate in-app.
- `scripts/setup-cloud.sh` enables required APIs, bounds the queue at 5
  dispatches/second and 20 concurrent dispatches, and creates the daily
  benchmark Scheduler job. It also enables `expiresAt` TTL for rate-limit and
  Stripe-event documents.
- `firestore.indexes.json` scopes the nested campaign queue query as
  `COLLECTION`, matching the repository query rather than a collection-group
  query.
- Next and `eslint-config-next` are pinned at 16.2.12.
- `package.json` uses explicit transitive overrides for patched PostCSS,
  Sharp, rimraf, and UUID versions until Next/Google packages lift their
  own pins. The overrides must remain covered by the full build/test gate.
- `npm audit --omit=dev --audit-level=high` currently reports zero
  vulnerabilities.
- `.env.production` intentionally contains only public Firebase browser
  configuration. `NEXT_PUBLIC_*` values are compiled into the browser bundle
  and are not secrets. All server secrets belong in Cloud Run/Secret Manager.

## Firestore additions and compatibility

No destructive migration is required. New fields use schema defaults or
nullable/defaulted values:

- campaign `launchStartedAt`;
- queue status `AMBIGUOUS`;
- billing `lastStripeEventCreated` and `lastStripeEventPriority`.

New server-only collections/documents:

- `users/{uid}/counters/{day}/sendReservations/{idempotencyKey}`;
- `stripeEvents/{eventId}` with a 180-day processed-event TTL (30 days for
  failed claims);
- `stripeCustomers/{customerId}`.
- `rateLimits/{bucketAndFingerprint}` with a Firestore timestamp TTL.

New organizations get `organizationSettings/main` with FREE billing state.
Existing orgs are not rewritten by this branch.

Before deployment, confirm required Firestore indexes still match query
plans. The deny-by-default rules do not need client access for the new
collections because all writes are Admin SDK server-side.

## Tests added or expanded

- HTML placeholder escaping and signature sanitization.
- Server-verified test-send destination.
- Structured log redaction.
- Tracking token expiry.
- Plan-aware tenancy capabilities.
- Stripe multiple-`v1` signature rotation and stale timestamp rejection.
- Correct external-load-balancer client-hop rate-limit fingerprinting.
- Paid-seat-limit resolution and durable follow-up/outbox behavior.
- Stripe subscription quantity precedence after portal changes.

The Firestore emulator suite is not runnable in the current local container:
the installed Java is 17 and Firebase CLI 15 requires Java 21. CI explicitly
installs Temurin 21 and runs the suite.

## Verification performed on 2026-07-28

The final local gate ran from a clean `npm ci` install:

```bash
npm ci                                      # pass
npm run typecheck                           # pass
npm run lint                                # pass
npm test                                    # pass: 35 files, 278 tests
npm run build                               # pass: 69 routes generated
npm audit --omit=dev --audit-level=high     # pass: 0 vulnerabilities
npm run docs:features                       # pass
git diff --check                            # pass
bash -n scripts/setup-cloud.sh              # pass
```

`npm run test:emulator` was attempted and stopped before the suite because
the container has OpenJDK 17.0.19 and Firebase Tools 15 refuses Java versions
before 21. It also reported that Firebase is not authenticated in this
terminal. Do not treat the emulator suite as passed locally. Require the
Java-21 GitHub quality gate to pass before merge.

## Production actions not authorized or completed here

This branch does not push, deploy, alter Firestore, change Cloud Run, create
Scheduler jobs, or configure third-party accounts. A human with the Alpine
account must separately:

1. Review and commit the branch in small logical commits.
2. Push and obtain a green GitHub quality gate.
3. Wire Stripe test keys and CLI forwarding; validate Checkout → webhook →
   plan/seat change → portal/cancel before live keys.
4. Apply `scripts/setup-cloud.sh email-tool-502714 us-central1 outreach`.
5. Configure `ERROR_WEBHOOK_URL` and an uptime check on `/api/health`.
6. Complete Google OAuth verification and CASA before setting
   `SIGNUP_MODE=open`.
7. Obtain approved legal entity details and counsel-reviewed Terms, Privacy,
   and DPA pages.
8. Confirm backup/export policy and recovery test.

`SETUP.md` contains the exact one-at-a-time gcloud, Firebase, and Stripe
authentication/verification sequence. Those credentials are machine-local;
they cannot be made permanent through repository changes or safely stored in
agent chat. This terminal currently has none of the three global CLIs and
cannot complete browser authorization on the user's behalf.

## Known product work intentionally still open

- Public legal pages require the actual contracting entity, address,
  governing law, retention/deletion policy, subprocessors, and counsel
  approval. Placeholder legal claims were not invented.
- OAuth verification/CASA and Stripe end-to-end test/live configuration are
  external workflows.
- The public landing animation/copy remains sales-forward in places. AI
  prompts were generalized, but the broader copy/onboarding roadmap should
  be handled as a separate product/brand review rather than silently
  rewriting the current design in a security patch.
- Playwright end-to-end coverage is still planned.
- Multi-inbox rotation, warmup, enrichment, multichannel, and SOC 2 remain
  roadmap items.

## Safe continuation rules for the next agent

- Read `AGENTS.md`, this file, `CAMPAIGN_SAFETY.md`, `SECURITY.md`, and
  `ARCHITECTURE.md` before editing.
- Run `git status --short` first. All uncommitted changes on this branch are
  part of this hardening pass.
- Do not deploy or push unless the user explicitly authorizes it.
- Do not turn on `SIGNUP_MODE=open`.
- Do not remove the delivery reservation or automatically retry AMBIGUOUS
  work.
- Do not replace server plan enforcement with UI-only gating.
- Do not add a client-selected test email destination.
- Update `lib/features/registry.ts`, then run `npm run docs:features` for
  any feature behavior change.

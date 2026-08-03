# Cadence Hardening Handoff

Read this document before modifying the hardening work. It is the durable
handoff between ChatGPT Codex and Claude Code; do not rely on either agent's
chat history.

## Work state

| Item | Value |
|---|---|
| Date | 2026-07-28 |
| Repository | `distinctioncreative-maker/gmail-campaign-app` |
| Base commit | `703ae2e` (`main`, merged production registry fix) |
| Working branch | `codex/enterprise-campaign-workspace` |
| Production service | `outreach`, `us-central1`, project `email-tool-502714` |
| Production owner | Alpine Google Workspace account |
| Previous release | Hardening PR #1 and registry-fix PR #7 were merged. The operator reported a successful Firestore deployment and corrected Cloud Build deployment of `main` at `703ae2e`; runtime health checks were not independently observed in this workspace |
| Push/deploy status | The verified implementation tree is published to `codex/enterprise-campaign-workspace` as remote commit `7d3c80f`; draft PR #8 is open with a green quality gate. Do not merge or deploy this branch |
| Baseline before this branch | Typecheck, lint, 36 test files / 281 unit tests, and production build passed |
| Last completed gate | Clean install, typecheck, lint, 38 test files / 288 unit tests, 69-route production build, runtime dependency audit, feature-doc generation, diff check, and setup-script syntax check passed locally. Draft PR #8 also passed the complete GitHub quality gate, including the Java 21 Firestore emulator suite |
| Current follow-up | Enterprise campaign intelligence and daily workflow: campaign-scoped reports, campaign command centers, wider template workspace, cleaner leads/help surfaces, first-open notifications, and product strategy |
| Emulator status | Blocked locally: Java 17 installed; Firebase CLI 15 requires Java 21. Draft PR #8 passed the suite in GitHub CI with Temurin 21 |
| CLI status in this terminal | Workspace-local `gh` 2.96.0 is checksum-verified; direct `api.github.com` authentication is blocked by sandbox policy, so publishing uses the connected GitHub app. No global `gcloud`, `firebase`, or `stripe`; repo-local Firebase CLI is installed but not authenticated |

The hardening and public-launch work is preserved in the merged history. This
follow-up keeps those safety boundaries while improving the operator-facing
product. Read
`docs/history/public-launch-audit.md` before changing positioning, public signup, billing,
legal/compliance work, or mobile architecture, and read
`docs/product/strategy.md` before expanding the competitive roadmap.

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
- A first tracked open creates at most one in-app notification per recipient.
  The stable notification ID is written in the same transaction that first
  sets `openedAt`; a click that supplies the first engagement signal follows
  the same rule. Notification copy must retain the image-preloading caveat.
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
- The unscoped full `npm audit` reports no-upstream-fix advisories in
  development-only Firebase CLI and ESLint dependency trees. They are not in
  the deployed runtime; CI still runs them from the pinned lockfile and
  Dependabot monitors for fixed versions.
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

Tracked-open notifications use deterministic documents in the existing
`users/{uid}/notifications` collection. No client write access or destructive
migration is required.

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
- Shared campaign performance and reporting-window calculations.
- Source-level enforcement that application copy does not reintroduce em
  dashes.

The Firestore emulator suite is not runnable in the current local container:
the installed Java is 17 and Firebase CLI 15 requires Java 21. CI explicitly
installs Temurin 21 and runs the suite.

## Verification performed on 2026-07-28

The final local gate ran from a clean `npm ci` install:

```bash
npm ci                                      # pass
npm run typecheck                           # pass
npm run lint                                # pass
npm test                                    # pass: 38 files, 288 tests
npm run build                               # pass: 69 routes generated
npm audit --omit=dev --audit-level=high     # pass: 0 vulnerabilities
npm run docs:features                       # pass
git diff --check                            # pass
bash -n scripts/setup-cloud.sh              # pass
```

`npm run test:emulator` remains blocked locally because this container has
OpenJDK 17.0.19 and Firebase Tools 15 requires Java 21. Draft PR #8's GitHub
quality gate installed Temurin 21 and passed the Firestore emulator suite,
along with install, typecheck, lint, unit tests, production build, and the
runtime dependency audit.

## Production state and operator-owned follow-up

The previous hardening release reached `main` and the authenticated operator
reported a successful Firestore and Cloud Build deployment. That report is
recorded here as operator evidence, not as an independently verified runtime
check.

This enterprise-workspace branch is authorized only for a branch push, draft
PR, and CI inspection. Do not merge or deploy it. Before any later production
release:

1. Confirm the exact reviewed commit and green GitHub quality gate.
2. Record the current Cloud Run rollback revision and preserve
   `TEST_MODE` / `FORCE_TEST_MODE`.
3. Deploy Firestore rules/indexes before the application if either changed.
4. Verify `/api/health`, signed-out landing/sign-in, authenticated app access,
   campaign reporting, and a test-mode email.
5. Wire Stripe test keys and CLI forwarding; validate Checkout → webhook →
   plan/seat change → portal/cancel before live keys.
6. Configure `ERROR_WEBHOOK_URL` and an uptime check on `/api/health`.
7. Complete Google OAuth verification and CASA before setting
   `SIGNUP_MODE=open`.
8. Obtain approved legal entity details and counsel-reviewed Terms, Privacy,
   and DPA pages.
9. Confirm backup/export policy and recovery test.

`docs/operations/setup.md` contains the exact one-at-a-time gcloud, Firebase, and Stripe
authentication/verification sequence. Those credentials are machine-local;
they cannot be made permanent through repository changes or safely stored in
agent chat. This terminal has no `gcloud`, and the repo-local Firebase CLI is
not authenticated.

## Known product work intentionally still open

- Public legal pages require the actual contracting entity, address,
  governing law, retention/deletion policy, subprocessors, and counsel
  approval. Placeholder legal claims were not invented.
- OAuth verification/CASA and Stripe end-to-end test/live configuration are
  external workflows.
- The landing page uses a restrained, explicitly labeled command-center
  sequence and an honest AI-assisted workflow story. Continue to avoid
  guaranteed inbox placement, replies, or revenue.
- Playwright end-to-end coverage is still planned.
- Multi-inbox rotation, warmup, enrichment, multichannel, and SOC 2 remain
  roadmap items.

## Safe continuation rules for the next agent

- Read `AGENTS.md`, this file, `docs/campaign-safety.md`, `docs/security.md`, and
  `docs/architecture.md` before editing. Read `docs/product/strategy.md` before
  adding roadmap scope or public claims.
- Run `git status --short` first. All uncommitted changes on this branch are
  part of this hardening pass.
- This branch is authorized for a draft PR and CI inspection only. Do not
  merge or deploy it without a new explicit instruction.
- Do not turn on `SIGNUP_MODE=open`.
- Do not remove the delivery reservation or automatically retry AMBIGUOUS
  work.
- Do not replace server plan enforcement with UI-only gating.
- Do not add a client-selected test email destination.
- Update `lib/features/registry.ts`, then run `npm run docs:features` for
  any feature behavior change.

## Recreated launch-experience release, 2026-07-29

The previously local-only launch-experience commits were unavailable and were
recreated from the verified `main` base
`6560ce892c6b56130cabe73643021c5390a9253b`.

Implemented in this release:

- conversion-focused, static, mobile-first public landing experience;
- shared and honest public/in-product pilot pricing;
- structured metadata, social preview, robots, sitemap, and browser headers;
- visual template-editor sanitization before DOM insertion;
- signed RFC 8058 one-click unsubscribe with scanner-safe GET and atomic
  suppression/counter updates;
- purpose-built mobile campaign cards and accessible campaign-section dialog;
- `docs/history/launch-readiness-2026.md` with exact evidence and remaining blockers.

Local verification:

```bash
npm run docs:features                       # pass
git diff --check                            # pass
npm run typecheck                           # pass
npm run lint                                # pass
npm test                                    # pass: 42 files, 299 tests
npm run build                               # pass: 72 routes generated
npm audit --omit=dev --audit-level=high     # pass: 0 vulnerabilities
```

The full development audit still reports 28 transitive developer-tool
findings (26 high, 2 moderate) with no current upstream fix. Runtime
dependencies are clean. Firestore emulation remains locally blocked by Java
17; GitHub CI installs Java 21. The local standalone smoke check confirmed
200 responses for the landing page, security headers, robots, sitemap, and
the 1200 by 630 social image. `/api/health` correctly remained unavailable
without local Firestore credentials.

This release remains branch/PR-only. Do not merge, deploy, turn on live
billing, open signup, or real sending without new explicit approval.

## Landing motion polish follow-up, 2026-07-30

This focused follow-up starts from merged `main`
`1ea95362fc3e8d4794af061b61bf1e4a58e9d1e3` on local branch
`agent/landing-motion-polish`.

Implemented:

- fixed the top-right pilot button contrast bug caused by the global anchor
  selector overriding the button text color;
- added an arrow, stronger focus treatment, and restrained hover feedback to
  the navigation call to action;
- added a looping, labeled lead-to-reply sequence inside the hero command
  center, synchronized with subtle metric, reply, and pacing signals;
- added tasteful AI-assist, personalization, and completion motion to the
  message-workspace demonstration;
- added small ambient and hover details without adding a motion library or
  new runtime dependency;
- disabled decorative animation under `prefers-reduced-motion`;
- added source-level regression coverage for CTA contrast, the accessible
  demo description, and reduced-motion behavior.

Verification:

```bash
npm ci --cache /tmp/cadence-npm-cache --no-audit --no-fund  # pass, 1,148 packages
npm run docs:features                                        # pass
git diff --check                                             # pass
npm run typecheck                                            # pass
npm run lint                                                 # pass
npm test                                                     # pass: 43 files, 302 tests
npm run build                                                # pass: 72 routes generated
```

This follow-up has not been pushed, merged, or deployed. It does not change
signup, billing, sending mode, Firestore rules, indexes, or production
configuration.

## Landing conversion and interactivity follow-up, 2026-07-30

This focused follow-up starts from merged `main`
`6f04079e68b870d85844bd97d991a549bc3ebd37` on local branch
`agent/landing-conversion-interactivity`.

Implemented:

- rewrote the public story around qualified conversations, consistent
  follow-up, visible Gmail controls, and human-reviewed AI assistance;
- converted the hero command center into a user-controlled six-stage
  walkthrough with pause/play, arrow-key navigation, reduced-motion behavior,
  and off-screen autoplay suspension;
- added deterministic, client-only AI before/after, brand-voice, variant,
  desktop/phone, approval, pacing, campaign-reporting, and reply interactions;
- labeled all sample data and kept the demos isolated from production AI and
  sending APIs;
- replaced every pilot hash link with shared behavior that centers the hero
  request form and focuses its email input after scrolling, with a CSS and
  no-JavaScript hash fallback;
- strengthened responsive layouts and practical touch targets without adding
  a motion library or runtime dependency;
- updated search, social, pricing, feature-registry, strategy, and readiness
  copy while preserving honest limits and all existing safety controls;
- expanded source-level regression coverage for CTA readability and focus,
  keyboard interactions, reduced motion, example labels, outcome claims,
  deterministic demos, and responsive touch targets.

Verification:

```bash
npm ci --cache /tmp/cadence-npm-cache --no-audit --no-fund  # pass, 1,148 packages
npm run docs:features                                        # pass
git diff --check                                             # pass
npm run typecheck                                            # pass
npm run lint                                                 # pass
npm test                                                     # pass: 43 files, 307 tests
npm run build                                                # pass: 72 routes generated
npm audit --omit=dev --audit-level=high                      # pass: 0 runtime vulnerabilities
```

The full development audit still reports the same 28 transitive
developer-tool findings with no current upstream fix. Firestore emulator
testing is locally blocked by Java 17; CI uses Java 21. A production-mode
local smoke test returned 200 for the landing page, robots, sitemap, and
social image and confirmed the expected security headers. The 1200 by 630
social image was visually reviewed. Full responsive screenshots remain
blocked because this workspace has Playwright but no installed browser binary.

This follow-up has not been pushed, merged, or deployed. It does not change
signup mode, live billing, real sending, Firestore rules, indexes, or cloud
configuration.

## Premium landing motion refinement, 2026-07-30

This focused refinement starts from the exact landing-experience tree
published to `main` as commit
`ec4b56a1f6840a832d77e77e840dfff4feb08ff0`.

Implemented:

- reduced the hero walkthrough cadence from 3.6 seconds to 2.3 seconds and
  added an immediately moving stage clock so the demonstration reads as
  active without waiting for the first content change;
- added a synchronized lead-to-draft-to-review-to-Gmail-to-reply rail, a
  stage-specific live-action signal, active launch-control feedback, and
  coordinated metric transitions;
- added requestAnimationFrame-bounded pointer lighting on fine pointers,
  while preserving touch behavior and avoiding layout-transform effects that
  could blur product text;
- paused the walkthrough when it leaves the viewport, the browser tab is
  hidden, the visitor pauses it, or reduced motion is requested;
- added clearer AI-assist feedback, subject and personalization motion,
  launch-sequence motion, reporting transitions, progressive section reveals,
  and consistent premium easing, shadows, hover states, and CTA feedback;
- removed obsolete flow-demo selectors and keyframes that no rendered
  component used;
- kept motion CSS-first and added no package or runtime dependency. The
  landing CSS source increased by about 1.4 KB gzip after the obsolete rules
  were removed;
- preserved the approved visual identity, conversion copy, managed-pilot
  path, responsive breakpoints, keyboard controls, honest example labels, and
  all safety and deliverability qualifications.

Verification:

```bash
npm run docs:features                       # pass
git diff --check                            # pass
npm run typecheck                           # pass
npm run lint                                # pass
npm test                                    # pass: 43 files, 308 tests
npm run build                               # pass: 72 routes generated
npm audit --omit=dev --audit-level=high     # pass: 0 vulnerabilities
```

A production-mode local smoke check returned HTTP 200 for the landing page,
confirmed the security headers, and verified the new live-walkthrough,
lead-signal, command-center, headline, and pilot-request content in the
server-rendered HTML. This workspace still has no browser binary, so
frame-by-frame screenshot and real-device confirmation remain external
review steps. This refinement remains only on the local
`agent/premium-motion-system` branch; it has not been pushed or deployed and
does not change signup, billing, sending, Firestore, OAuth, secrets, or cloud
configuration.

## Premium universal design pass, 2026-07-31

This cohesive frontend pass starts from verified `main` commit
`4d40072d41718f7ce61f1db55bb6bcda81271af7` and is implemented on
`agent/premium-universal-design`. Direct publication to `main` was explicitly
authorized, but deployment remains out of scope.

Implemented:

- replaced the decorative mark in public and authenticated navigation chrome
  with a quiet typographic Cadence wordmark while retaining the pulse mark in
  product demonstrations and other purposeful identity moments;
- refined the public color system, typography, spacing, radii, shadows,
  editorial outcome layout, navigation density, section hierarchy, pricing,
  FAQ, and final conversion panel without changing the managed-pilot flow;
- sharpened landing copy around a clear lead-to-conversation operating system,
  human-reviewed AI, deliberate Gmail pacing, visible consent, and actionable
  replies while retaining the explicit deliverability and outcome caveats;
- refined the shared authenticated-app tokens, sidebar, mobile top and bottom
  navigation, page headers, cards, empty states, focus rings, and form/button
  geometry so public and product surfaces read as one system;
- raised mobile application and landing call-to-action controls to practical
  44-pixel touch targets and preserved keyboard, reduced-motion, responsive,
  and safe-area behavior;
- replaced decorative emoji with the existing enterprise line-icon system in
  onboarding, product tour, imports, campaign creation and pacing warnings,
  AI writing, replies, home insights, test center, and admin health surfaces;
- removed unsafe universal sending-volume copy and broad reply-rate promises
  from settings, campaign guidance, help, and deliverability education;
- added source-level regression coverage for typography-first navigation,
  44-pixel touch targets, and icon consistency in core journeys.

Verification:

```bash
NPM_CONFIG_CACHE=/tmp/cadence-npm-cache npm ci  # pass: 1,148 packages
npm run docs:features                           # pass
git diff --check                                # pass
npm run typecheck                               # pass
npm run lint                                    # pass
npm test                                        # pass: 44 files, 312 tests
npm run build                                   # pass: 72 routes
npm audit --omit=dev --audit-level=high         # pass: 0 vulnerabilities
```

The Firestore emulator gate could not start locally because the sandbox
blocked the external emulator download; GitHub CI on Java 21 remains the
authoritative emulator gate. A production standalone smoke check returned HTTP
200 for `/`, confirmed CSP and the other security headers, and found the new
wordmark, hero, conversion copy, and pilot CTA in rendered HTML. `/api/health`
returned the expected local 503 because this isolated workspace has no
production Firestore credentials. The cloud visual browser was unavailable,
so real-device screenshot review remains a post-CI observation, not a hidden
release claim.

This pass does not change authentication, authorization, tenant isolation,
signup mode, billing activation, email delivery, campaign safety, Firestore
rules or indexes, OAuth, secrets, or cloud configuration. It must not be
deployed by an agent.

## Marketing contrast and account-access hardening, 2026-08-01

This pass starts from verified `main` commit
`7c8caa821084418602d80d96d509414663afcdd8` and was implemented on
`agent/design-regression-accessibility`. Direct publication to `main` was
authorized; deployment remains explicitly out of scope.

Before changing source, the production landing page at
`https://outreach-616949765761.us-central1.run.app/` was inspected in a real
browser. The workflow content and pilot form were functional, but muted text
still carried the older cool-grey character and the hero began near invisible,
making the first viewport appear blank during its initial reveal. The top
navigation pilot action moved focus to the hero email field and kept that field
inside the desktop viewport.

Implemented:

- moved the public landing page onto a theme-invariant warm neutral ramp in
  `app/globals.css`, removed all 217 literal hex colors from
  `components/marketing/landing.module.css`, and assigned semantic foreground,
  muted, on-ink, border, success, revenue, and danger combinations;
- added source-level contrast regression tests for public paper, surface, and
  dark-band text pairs, including computed color mixes, and kept normal text at
  WCAG AA contrast targets;
- preserved every landing section, conversion claim, pilot-request behavior,
  safety caveat, responsive breakpoint, and reduced-motion behavior;
- raised the initial hero and product-frame reveal opacity so the value
  proposition is immediately visible while the premium entrance motion still
  runs;
- made the persistent account control explicitly say `Switch or sign out`,
  added a clear account label and accessible menu relationship, returned focus
  after Escape, and kept actions at practical touch-target sizes;
- moved the desktop menu beside the sidebar and made the mobile menu expand
  within the scrollable navigation sheet, preventing upward clipping on short
  viewports;
- replaced raw red sign-out utilities with semantic danger tokens, added the
  shared logout icon, and removed the unused standalone sign-out component;
- documented account switching in the in-product Help Center and user guide;
- registered the marketing contrast system and updated account behavior in the
  shared feature registry, then regenerated `docs/features.md`, which also
  powers `/admin/features` inside the application;
- documented public marketing tokens and their usage in `docs/brand.md`.

The authenticated app primary color was not changed. The handoff requires an
owner decision before that global brand change. Three accessible options,
exact tokens, contrast ratios, tradeoffs, and a recommended restrained plum
direction are recorded in `docs/brand-primary-options.md`.

Local verification before publication:

```bash
NPM_CONFIG_CACHE=/tmp/cadence-npm-cache npm ci  # pass: 1,148 packages
npm run docs:features                           # pass
npx vitest run tests/unit/landing-experience.test.ts tests/unit/premium-design-system.test.ts
                                                # pass: 2 files, 15 tests
npm run typecheck                               # pass
npm run lint                                    # pass
npm test                                        # pass: 46 files, 335 tests
npm run build                                   # pass: 72 routes
npm audit --omit=dev --audit-level=high         # pass: 0 vulnerabilities
git diff --check                                # pass
```

A standalone production smoke check returned HTTP 200 for `/`, found the hero
and all three pilot calls to action in server-rendered HTML, and confirmed CSP,
HSTS, Referrer-Policy, `nosniff`, frame denial, Permissions-Policy, and COOP
headers. The cloud visual browser blocks local loopback and local-file URLs, so
post-change browser screenshots could not be captured from this environment;
no indirect bypass was attempted. GitHub Actions remains the authoritative
Firestore emulator and integration gate after publication.

This pass does not alter authentication flow semantics, authorization, tenant
isolation, `SIGNUP_MODE`, `TEST_MODE`, `FORCE_TEST_MODE`, billing activation,
email delivery, suppression enforcement, idempotency, campaign safety,
Firestore rules or indexes, OAuth scopes, secrets, or cloud configuration. It
must not be deployed by an agent.

## Restrained plum and editorial blue brand system, 2026-08-01

This visual-system pass starts from verified `main` commit
`d0de725cca807b087c5eae542d60dc040fa793d9` and is implemented on
`agent/plum-blue-brand`. The founder selected option B, restrained plum, and
explicitly asked for blue to remain part of the identity. Publication and
deployment were not authorized by this request.

Implemented:

- replaced the retired electric indigo with a semantic plum action lane:
  `#72506f` primary, `#5e405b` hover, and `#f4edf3` soft in light mode;
- added an editorial blue information lane: `#456a8d` information,
  `#355674` hover, and `#eaf1f7` soft in light mode;
- tuned lifted dark-theme plum and blue tokens, plus separate foreground-on-fill
  tokens so primary buttons, blue controls, and plum-to-blue identity gradients
  retain AA text contrast in both themes;
- assigned plum to calls to action, focus, selection, active navigation, and
  primary data while assigning blue to AI writing, AI sequences, campaign
  personalization, informational toasts and badges, previously contacted
  states, and activity-chart transitions;
- moved the logo, compact identity moments, sign-in panel, ambient page light,
  Home aurora, and chart endpoint onto a coordinated plum-to-blue system;
- made the public marketing plum and blue tokens theme-invariant so a saved
  dashboard theme cannot change landing-page contrast or CTA readability;
- refined the landing hero atmosphere with a restrained plum bloom and blue
  signal light without changing layout, copy, motion cadence, responsive
  behavior, pilot-request behavior, or deliverability qualifications;
- updated the Open Graph image, signed unsubscribe page, and starter email CTA
  so ancillary public surfaces no longer present the retired blue-only brand;
- removed all direct blue, purple, violet, and indigo utility classes from
  product source and replaced them with semantic information or primary tokens;
- documented the approved decision and exact contrast evidence in
  `docs/brand.md` and `docs/brand-primary-options.md`;
- registered the shipped brand system in the shared feature registry and
  regenerated `docs/features.md`, which also powers `/admin/features`;
- added `tests/unit/brand-palette.test.ts` to verify exact light/dark tokens,
  body text, soft-surface text, filled-control text, both gradient endpoints,
  the absence of retired colors, semantic AI use, and marketing invariance.

Measured contrast includes plum on paper at 6.24:1, blue on paper at 5.22:1,
light filled controls at 6.79:1 and 5.68:1, dark plum and blue on the dark
surface at 8.36:1 and 8.17:1, and dark filled controls at 8.25:1 and 8.05:1.

Local verification:

```bash
npm run docs:features                           # pass
npx vitest run tests/unit/brand-palette.test.ts tests/unit/landing-experience.test.ts tests/unit/premium-design-system.test.ts
                                                # pass: 3 files, 20 tests
npm run typecheck                               # pass
npm run lint                                    # pass
npm test                                        # pass: 47 files, 340 tests
npm run build                                   # pass: 72 routes
npm audit --omit=dev --audit-level=high         # pass: 0 vulnerabilities
git diff --check                                # pass
```

A production standalone smoke check returned HTTP 200 for `/` and `/sign-in`,
found the conversion headline in server-rendered HTML, and confirmed CSP,
HSTS, Referrer-Policy, `nosniff`, frame denial, Permissions-Policy, and COOP
headers. The generated production CSS contains the approved plum and blue
tokens. The cloud visual browser still blocks local loopback and local-file
URLs, so real-device screenshot confirmation remains an external observation
step rather than an unverified release claim.

This pass changes presentation tokens and semantic styling only. It does not
change authentication, authorization, tenant isolation, signup mode, test
modes, billing, sending, suppression enforcement, idempotency, campaign safety,
Firestore, OAuth, secrets, cloud resources, or production traffic.

## Lead organization and zoom-accessibility hardening, 2026-08-01

This pass starts from verified `main` commit
`717d2e94551db43649df233186959047a65e503e` and was implemented on
`agent/lead-tags-accessibility`. Direct publication to `main` was authorized;
deployment remains out of scope.

Implemented:

- added normalized, case-insensitive lead tags with a 20-tag per-contact cap
  and 32-character label limit while keeping legacy contact documents readable;
- added tag and saved-list filters to the Leads directory, tag-aware search,
  visible tag chips, per-lead editing, and accessible bulk controls for adding
  or removing selected leads from tags and lead lists;
- added tag filtering and tag context to the campaign lead picker so saved
  segments can become campaign audiences without duplicating contact data;
- kept all bulk operations under `users/{uid}` after `requireUser()`, verified
  list ownership before mutation, made repeated membership changes idempotent,
  and reconciled denormalized lead-list counts transactionally when membership
  changes or contacts are deleted;
- kept the public Log in action visible at narrow effective widths created by
  browser zoom and maintained a practical 44-pixel target;
- made the desktop app navigation independently scrollable inside `100dvh` so
  the account and sign-out control cannot be clipped on short or zoomed
  viewports;
- made the mobile More sheet use dynamic viewport height, a persistent account
  region, two-column fallback on very narrow screens, body-scroll locking,
  initial focus, Escape handling, focus trapping, and focus restoration;
- added arrow-key, Home, End, and Escape behavior to the account menu;
- added a dashboard skip link, responsive lead-detail definition lists,
  semantic success/warning/danger treatments, 44-pixel action targets, and
  mobile-safe campaign filters and horizontal lead-table scrolling;
- replaced unsupported landing-page inbox and spam guarantees with compelling
  but qualified Gmail, pacing, AI-review, deliverability, and reply-workflow
  language;
- registered the shipped feature in `lib/features/registry.ts`, regenerated the
  in-app feature documentation, and updated the architecture and data model.

Local verification:

```bash
NPM_CONFIG_CACHE=/tmp/cadence-lead-tags-npm-cache npm ci
                                                # pass: 1,148 packages
npm run docs:features                           # pass
npx vitest run tests/unit/lead-tags.test.ts tests/unit/landing-experience.test.ts tests/unit/premium-design-system.test.ts
                                                # pass: 3 files, 24 tests
npm run lint                                    # pass
npm run typecheck                               # pass
npm test                                        # pass: 48 files, 349 tests
npm run build                                   # pass once; final rerun blocked by fonts.gstatic.com HTTP 502
npm audit --omit=dev --audit-level=high         # pass: 0 vulnerabilities
git diff --check                                # pass
```

The successful production build generated a BUILD_ID, and its standalone server
returned HTTP 200 for `/`, rendered the new
qualified hero copy plus Log in and all pilot calls to action, and returned CSP,
HSTS, Referrer-Policy, `nosniff`, frame denial, Permissions-Policy, and COOP
headers. A final build rerun reached Next.js font optimization but failed before
application compilation when every Google Fonts request returned HTTP 502; no
source, type, lint, or test failure was reported. The local Firestore emulator
gate also could not start because its uncached binary requires network approval
unavailable in this workspace. GitHub Actions on Java 21 remains the
authoritative clean build, emulator, and integration gate after publication.

This pass does not change signup mode, test modes, live billing, email sending,
OAuth scopes, secrets, suppression enforcement, ambiguous-delivery quarantine,
rate limits, plan limits, idempotency, Firestore rules or indexes, cloud
resources, or production traffic. It must not be deployed by an agent.

## Lifecycle, compliance, onboarding, and organization hardening, 2026-08-03

This pass starts from verified `main` commit
`939b32d111031b1d351bd495424657aaa8e70e41` and was implemented on
`agent/lifecycle-compliance-release`. Direct publication to `main` is
authorized, but staging and committing still require the repository-owner
confirmation recorded by the GitHub workflow. Deployment remains explicitly
out of scope.

Implemented:

- replaced destructive campaign deletion with a terminal-state soft-delete
  lifecycle, active, archived, and Recently Deleted views, retained campaign
  KPIs and deletion dates, restore, and an explicit permanent-purge boundary;
- excluded soft-deleted campaigns from current and all-time dashboard, report,
  reply, system-health, and team totals while retaining their metrics inside
  Recently Deleted;
- removed the fixed lead-directory ceiling through stable cursor pagination,
  added Date added throughout lead views, and split large imports into bounded
  200-row API batches without weakening duplicate or suppression checks;
- kept click tracking enabled by default with campaign-level opt-out, excluded
  unsubscribe links from click rewriting and counting, and preserved signed
  one-click unsubscribe behavior;
- fixed template-editor caret resets, moved sanitization to preview, test, and
  save boundaries, and added an optional compliance-footer helper that cannot
  remove the required physical-address or opt-out content;
- added public Terms, Privacy, Acceptable Use, and Compliance surfaces, linked
  them from marketing, sign-in, Help, sitemap, and footer surfaces, and marked
  unresolved legal-entity, address, jurisdiction, retention, subprocessors,
  DPA, and counsel review as launch requirements rather than invented facts;
- rebuilt onboarding as an accessible workspace setup flow for workspace name,
  industry, team size, planned monthly outreach, primary workflow, Gmail,
  profile, sending defaults, safe testing, and a clear first-success milestone;
- added an optional first-run product tour with responsive positioning, focus
  trapping, Escape and focus restoration, reduced-motion support, and concise
  plum-and-blue workflow animation;
- added organization-scoped custom role labels that map to the audited Member,
  Manager, and Administrator permission tiers instead of introducing arbitrary
  permissions, including assignment-safe deletion and role labels throughout
  app navigation;
- added parent-team hierarchy with admin-only structure changes, cycle
  prevention, descendant visibility for parent-team managers, safe reparenting
  on deletion, and explicit hierarchy tests;
- completed a source-level semantic color sweep across the authenticated app,
  removed literal status palettes and opacity-reduced muted text from product
  source, and added AA regression checks for both light and dark themes;
- patched compatible transitive `brace-expansion` and `postcss` releases in the
  lockfile, reducing the production dependency audit from two advisory classes
  to zero vulnerabilities;
- removed unused default Next.js public assets, kept generated build artifacts
  ignored, documented the intentionally tracked public Firebase browser
  configuration, updated architecture, data model, security, campaign safety,
  product strategy, launch audit, feature registry, and generated feature docs;
- recorded 20 brand-name candidates and a five-name shortlist in
  `docs/product/brand-naming-exploration.md`, with trademark and domain checks
  explicitly required before renaming the product;
- kept lead sourcing or scraping as a future discovery item that requires
  provider terms, privacy, consent, accuracy, provenance, cost, and abuse review
  before implementation.

Local verification after the dependency patch:

```bash
NPM_CONFIG_CACHE=/tmp/cadence-npm-cache npm ci
                                                # pass: 1,148 packages
npm run typecheck                               # pass
npm run lint                                    # pass
npm test                                        # pass: 55 files, 370 tests
npm run docs:features                           # pass
npm run build                                   # pass: 78 routes
npm audit --omit=dev --audit-level=high         # pass: 0 vulnerabilities
npm audit --audit-level=high                    # 20 dev-tool findings: 2 moderate, 18 high
git diff --check                                # pass
```

The all-dependency audit findings are confined to development tooling through
`eslint` and `firebase-tools`; npm reports no current upstream fix. Those
packages are not copied into the production runner. They remain documented
toolchain debt and must not be described as a clean all-dependency audit.

The standalone production server returned HTTP 200 for `/`, `/sign-in`,
`/terms`, `/privacy`, `/acceptable-use`, `/compliance`, `/sitemap.xml`, and
`/robots.txt`. It returned CSP, HSTS, Referrer-Policy, `nosniff`, frame denial,
Permissions-Policy, and COOP headers. `/api/health` returned the expected local
503 degraded response because this environment has no Google Cloud credentials;
the authenticated Firestore check must be repeated against the deployed
revision. The local Firestore emulator gate cannot run because this container
has OpenJDK 17 and the required emulator download is unavailable. GitHub Actions
installs Java 21 and remains the authoritative Firestore isolation gate after
publication.

This release preserves `SIGNUP_MODE=allowlist`, `TEST_MODE`,
`FORCE_TEST_MODE`, tenant isolation, suppression enforcement, idempotency,
ambiguous-delivery quarantine, rate and plan limits, send safety, existing OAuth
scopes, secret handling, and billing gates. It adds one Firestore campaign index
that must be deployed before application traffic is moved to the new revision.
No merge, Cloud Run deployment, unrestricted registration, live billing, or
real-send activation was performed by the agent.

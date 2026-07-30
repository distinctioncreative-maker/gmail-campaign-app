# Cadence Pilot Launch Readiness

Evidence updated: 2026-07-30
Current follow-up base: remote `main`
`ec4b56a1f6840a832d77e77e840dfff4feb08ff0`
Current release branch: `agent/premium-motion-system`

## Executive recommendation

**Conditional go for an allowlisted, managed design-partner pilot in TEST mode.
No-go for collecting payment, unrestricted signup, or unattended real sending
until the external blockers below are closed.**

This release materially improves the product proof, mobile campaign workflow,
pricing consistency, browser security baseline, template-editor safety, and
recipient consent path. It does not turn source-level readiness into legal,
OAuth, payment, monitoring, or operational approval.

## What this release implements

### Public experience and conversion

- Replaces the old simulated-revenue story with explicitly labeled,
  user-controlled campaign, writing, pacing, and reporting demonstrations.
- Rewrites the homepage around one clear value proposition, one primary pilot
  request, a lower-commitment workflow link, concrete product proof, and
  honest trust language.
- Shows the full lead import, AI-assisted writing, controlled pacing,
  campaign-level reporting, and reply workflow without guaranteed outcome
  claims.
- Shares plan names, prices, minimum quantities, and limits between the public
  landing page and authenticated billing UI.
- Adds structured metadata, a generated 1200 by 630 social image, robots,
  sitemap, and global browser security headers.
- Preserves fluid responsive rules for 320px phones through wide desktop
  layouts, including stacked forms, cards, pricing, proof panels, and product
  demonstrations. Real-device browser confirmation remains a broader-launch
  gate.
- Centers the pilot form and focuses its email field from every pilot call to
  action so the sticky navigation cannot hide the requested input.
- Pauses the guided hero sequence after direct interaction, while it is off
  screen, and whenever reduced motion is requested.
- Makes the product story visibly active within the first second through a
  2.3-second stage cadence, active stage clock, lead-to-reply motion rail,
  live-action feedback, and synchronized controls instead of waiting for a
  subtle delayed state change.
- Extends the same premium motion language to AI assistance, message review,
  launch controls, reporting, section entrances, cards, and calls to action
  using CSS-first transform and opacity effects, with no new runtime
  dependency.
- Pauses autoplay when the browser tab is hidden and bounds pointer-responsive
  lighting updates to animation frames. Obsolete unrendered animation CSS was
  removed before measuring the final asset cost.

### Product usability

- Adds readable campaign cards for mobile rather than forcing the desktop
  table into a narrow viewport.
- Replaces mobile campaign-detail anchor overflow with primary links and a
  keyboard-accessible native dialog for additional sections.
- Keeps desktop tables and navigation available at appropriate breakpoints.
- Sanitizes imported, restored, AI-generated, pasted, linked, and image
  content before it enters the visual template-editor DOM. The existing
  server storage and send sanitization remains the final authority.

### Consent and email safety

- Adds domain-separated, signed, expiring unsubscribe tokens.
- Adds RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers to
  non-test campaign mail.
- Keeps GET scanner-safe: it renders confirmation and never mutates state.
- Requires the exact one-click form POST, rate-limits it, and atomically
  updates recipient state, campaign and daily counters, and a deterministic
  do-not-email suppression.
- Cancels remaining queue work after the suppression transaction and
  preserves idempotent behavior on retries.
- Leaves `SIGNUP_MODE=allowlist`, `TEST_MODE`, `FORCE_TEST_MODE`, plan caps,
  final suppression checks, delivery reservation, and ambiguous-delivery
  quarantine unchanged.

## Severity-ranked readiness audit

### Launch blockers before the first paying customer

1. **Legal approval:** Publish counsel-reviewed Terms, Privacy, Acceptable Use,
   anti-spam terms, cancellation language, data-processing terms, and the
   correct legal entity and contact details. Placeholder claims were not
   invented in this release.
2. **Stripe end-to-end validation:** Configure test keys and price IDs, then
   verify Checkout, signed webhook processing, plan and seat changes, portal,
   cancellation, and failure recovery. Only then review live-key activation.
3. **Google OAuth approval:** Complete Google verification and any required
   CASA work before open signup. Keep the current allowlist until approved.
4. **Data rights:** Complete and test customer-facing account deletion and
   export workflows, including retention and backup behavior.
5. **Operational response:** Configure error alerts, uptime monitoring,
   on-call ownership, support escalation, and a tested backup and restore
   procedure.

### Required before broader public launch

- Add automated browser journeys for signup, onboarding, import, campaign
  preparation, templates, reports, account switching, and billing.
- Validate responsive and accessible behavior in current Safari on iOS,
  Chrome on Android, and supported desktop browsers using real devices or an
  approved browser lab.
- Complete load and capacity exercises for queue concurrency, Firestore hot
  paths, Gmail quota adaptation, and campaign cancellation under load.
- Define SLOs, incident severity, customer communication, deletion timelines,
  subprocessors, and regional-data commitments.
- Validate pricing against measured AI, Firestore, Cloud Tasks, support, and
  enrichment unit costs.

### Near-term hardening

- Replace CSP inline allowances with nonce or hash-based script policy when
  the framework integration is ready.
- Preserve the current production-only runtime dependency audit in CI and
  monitor the developer-tool advisory chain for upstream fixes.
- Add transaction-level emulator coverage for one-click unsubscribe beyond the
  current pure-function, MIME, token, and route regression tests.
- Capture approved before-and-after desktop, tablet, and phone screenshots in
  a browser environment that can access the preview.

### Future scale work

- Multi-inbox rotation and provider-aware warmup.
- Lead research and enrichment with source visibility, consent, caching, and
  strict spend controls.
- Formal tracing, regional architecture options, advanced disaster recovery,
  and compliance programs such as SOC 2.
- Agency controls and larger-workspace administration after real pilot
  evidence identifies the correct model.

## Pricing recommendation and assumptions

| Plan | Current pilot price | Minimum | Product ceiling | Intended fit |
|---|---:|---:|---:|---|
| Starter | $29 monthly | 1 user | 150 scheduled sends per day | One focused sender |
| Team | $24 per user monthly | 2 users | 400 scheduled sends per workspace per day | Small collaborative team |
| Enterprise | Custom | Defined in agreement | Defined in agreement | Reviewed agency or larger-team rollout |

These are monthly pilot prices, not validated long-term unit economics.
Annual billing, overages, discounts, and live self-service checkout are not
active. Daily limits are hard product ceilings, not recommended targets or a
promise that every Gmail account can safely use the maximum. Final pacing must
remain provider-aware and account-specific.

`PRODUCT_STRATEGY_2026.md` contains the current official-source competitor
research. The implemented strategy follows the defensible gaps identified
there: clearer Gmail-native operation, honest deliverability language,
campaign-level context, a simpler workflow, visible safety controls, and a
managed-pilot offer rather than fake unlimited scale.

## Validation evidence

Commands were run from a clean dependency install in the release workspace.

| Gate | Result |
|---|---|
| `NPM_CONFIG_CACHE=/tmp/cadence-npm-cache npm ci --no-audit --no-fund` | Pass, 1,148 packages installed |
| `npm run docs:features` | Pass |
| `git diff --check` | Pass |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass, 43 files and 308 tests |
| Focused landing experience tests | Pass, 9 tests |
| `npm run build` | Pass, 72 routes generated |
| `npm audit --omit=dev --audit-level=high` | Pass, 0 runtime vulnerabilities |
| `npm audit --audit-level=moderate` | 28 developer-tool findings, 26 high and 2 moderate, with no current upstream fix |
| Production HTTP smoke check | Landing, security headers, robots, sitemap, and generated social image returned 200 |
| Landing HTML smoke check | Pass, HTTP 200 with security headers; new live walkthrough, lead signal, command center, outcome headline, and pilot request rendered |
| Landing motion asset review | Pass, no added dependency; final landing CSS adds about 1.4 KB gzip after obsolete animation rules were removed |
| Social-image inspection | Pass, valid 1200 by 630 PNG and visually reviewed |
| `/api/health` in local standalone runtime | Expected 503 because local Firestore credentials are unavailable |
| `npm run test:emulator` | Locally blocked: installed Java 17; Firebase CLI 15 requires Java 21 |

The repository GitHub workflow installs Java 21 and remains the authoritative
Firestore emulator gate. A local full-page screenshot run was not possible
because this workspace has no browser binary and its cloud browser cannot
reach localhost. Build-time responsive CSS validation passed; device-level
manual verification remains explicitly open.

## Release and rollback

This branch is authorized only for a push, draft pull request, and CI
inspection. It must not be merged or deployed as part of this work.

Before a later approved deployment:

1. Require a green GitHub quality gate on the exact reviewed commit.
2. Record the current Cloud Run service image and latest ready revision.
3. Confirm `SIGNUP_MODE=allowlist` and preserve `TEST_MODE` /
   `FORCE_TEST_MODE`.
4. Deploy only through the documented `DEPLOYMENT.md` process.
5. Smoke-test health, signed-out landing/sign-in, authenticated access,
   imports, templates, reports, and a test-mode email.
6. Roll back by routing Cloud Run traffic to the recorded ready revision if
   any release gate fails. Do not retry ambiguous delivery work.

## Final decision

- **Allowlisted TEST-mode design partner:** conditional go after the operator
  confirms support ownership and privacy handling.
- **Paying pilot:** no-go until legal and Stripe test validation are complete.
- **Live real sending:** no-go until operator approval and production smoke
  testing.
- **Open public signup:** no-go until OAuth/CASA, legal, deletion/export,
  monitoring, and broader browser validation are complete.

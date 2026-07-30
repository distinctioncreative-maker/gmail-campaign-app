# Cadence

Cadence is an AI-assisted, Gmail-native outreach platform for small teams that
want useful automation without giving up control. Each user connects their own
Gmail or Google Workspace account, imports a relevant audience, writes
on-brand emails with optional AI, sends at a controlled pace, works real reply
threads, and learns from campaign-level outcomes.

**"Turn relevant outreach into real conversations from your own Gmail"** is
the core promise. Cadence supports safer execution and clearer learning; it
does not guarantee inbox placement, replies, or revenue. Sales outreach is the
first use case, not the ceiling. The same product serves founders,
marketers, recruiters, agencies, fundraising, partnerships, and newsletters.

For the full structural map of routes, modules, and components, see
**[ARCHITECTURE.md](ARCHITECTURE.md)**. For a live-maintained list of what's
built vs. planned, see **[FEATURES.md](FEATURES.md)** (also viewable in-app
at `/admin/features`).

## Stack

Next.js 16 (App Router, TypeScript strict) · React 19 · Tailwind v4 ·
Cloud Run (Dockerfile, standalone output, Turbopack) · Firebase Auth
(Google sign-in) → Firebase Admin session cookie · Firestore (Admin SDK
server-side; deny-by-default `firestore.rules`) · Cloud Tasks + Cloud
Scheduler (OIDC-verified worker + cron sweeps) · jose-signed OAuth state · Cloud KMS (token
encryption) · Gmail API (`gmail.compose` + `gmail.readonly`) · Google
Gemini (optional AI, env-gated) · Stripe (billing, env-gated) · Zod
validation everywhere.

## How it's structured, at a glance

- **Tenancy is the backbone.** Every request resolves an `AuthContext`
  (`lib/auth/requireUser.ts`) carrying `userId`, `organizationId`, `role`,
  and `tenantType`. Data is scoped by owner: `users/{uid}/...` and
  `organizations/{orgId}/...`.
- **Dual-mode tenancy** (`lib/tenancy/`): a company email domain becomes a
  shared **Workspace** org (a team); a consumer provider (gmail.com,
  outlook.com, etc.) becomes a private, per-user **Solo** workspace, so
  individual signups never collide with each other or with a company's
  Workspace. A Solo user who invites a teammate gets promoted into a full
  Workspace in place.
- **`lib/tenancy/capabilities.ts`** is the single source of truth for what a
  tenant can do (teams, invites, admin console, live sending, daily send
  cap) — every UI gate and API guard reads `capabilitiesFor(tenantType,
  plan)`, so a plan or tenant-type change updates behavior everywhere.
- **Sending safety**: `lib/gmail/safety.ts` is the one choke point every
  outbound email passes through. It forces test-mode (mail redirected to a
  test address) until an admin explicitly flips an org LIVE. The Cloud Tasks
  send worker (`app/api/tasks/send-message`) reserves quota and delivery
  transactionally; an uncertain Gmail outcome is quarantined for review
  instead of retried into a possible duplicate. Confirmed sends atomically
  create their next durable follow-up queue record, and the repair sweep
  handles Cloud Task publication failures and long-delay work.
- **Billing** (`lib/billing/`) is env-gated: with no `STRIPE_SECRET_KEY` set,
  billing is a no-op and pricing shows "coming soon." `plans.ts` is the plan
  catalog; `stripe.ts` is a dependency-free REST client + webhook verifier.
- **Documentation upkeep is enforced as a workflow, not a hope**: see
  [AGENTS.md](AGENTS.md) → "Documentation upkeep." Every feature change
  updates `lib/features/registry.ts`, which regenerates `FEATURES.md` and
  is what the in-app `/admin/features` checklist renders — so the doc, the
  generated file, and the live UI can't drift apart.
- **GitHub is the quality gate**: pull requests and pushes to `main` run
  typecheck, lint, unit tests, Firestore emulator isolation tests, a
  production build, and a high-severity production-dependency audit.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full route/module/component
breakdown, and [DATA_MODEL.md](DATA_MODEL.md) for the Firestore schema.

## What's built (summary — see FEATURES.md for the live list)

| Area | Highlights |
|---|---|
| Auth & tenancy | Google sign-in, dual-mode Solo/Workspace tenancy, allowlist/open signup modes, Solo→Team promotion, roles |
| Leads | Salesforce-paste + CSV import, lead lists, lead command center, suppressions |
| Templates & AI | Visual/starter/paste/Gmail-draft templates, AI writer with brand memory, improve/shorten/subject-line AI, A/B rotation |
| Campaigns & sequences | Campaign wizard, Cloud Tasks sending engine, idempotent worker, pacing/caps/windows, pause/resume/cancel/retry/clone, collision detection, follow-up sequences |
| Replies | Reply triage (Interested/Needs reply/Not now), AI reply drafts, bounce + unsubscribe handling, scheduled sweeps |
| Deliverability | SPF/DKIM/DMARC checks, Gmail Postmaster reputation, spam-risk checker |
| Reporting & teams | Per-campaign intelligence, date cohorts, funnel and timing analysis, comparison export, team-lead dashboards, read-only drill-down, home briefing |
| Billing | Stripe Checkout + portal, plan catalog, plan-based send caps (test-mode keys wired; live wiring in progress) |
| Admin & ops | Admin console, sending-mode go-live gate, system health page, Help/Test Center, waitlist admin, in-app feature checklist |
| Observability | Structured error reporting + webhook alerts, `/api/health` |
| Public site | Outcome-led landing page with interactive product demos, responsive pilot CTAs, pricing, and waitlist capture |

## Roadmap to public launch

1. Validate Stripe Checkout → webhook → plan flip end to end (test mode),
   then move to live keys.
2. Google OAuth verification + CASA security assessment (required before
   `SIGNUP_MODE=open` for the general public).
3. ToS / Privacy / DPA pages.
4. Turn on error alerting (`ERROR_WEBHOOK_URL`) + an uptime monitor on
   `/api/health`.
5. Generalize copy/onboarding beyond sales for the broader outreach
   audience (founders, marketers, recruiters, agencies, fundraising,
   partnerships, newsletters).
6. Later "compete" tier: multi-inbox rotation + inbox warmup, contact
   enrichment, LinkedIn/multichannel, SOC 2.

## Quick start

```bash
npm install
cp .env.example .env        # fill in values — see SETUP.md
npm run dev                 # http://localhost:3000
npm test                    # unit tests — parser, scheduling, eligibility, safety…
npm run test:emulator       # Firestore rules isolation tests (needs Java)
npm run typecheck
npm run lint
npm run build
npm run docs:features       # regenerate FEATURES.md after editing the registry
```

After the first Cloud Run deploy, run `bash scripts/setup-cloud.sh PROJECT_ID`
once to provision the Cloud Tasks queue, service accounts/IAM, and the
Cloud Scheduler sweeps (reply/bounce/repair/metrics/benchmarks).

## Email safety (read this first)

Sending mode is controlled **in-app** by an admin (Administration → Sending
mode), defaulting to **test**. While in test mode, every outbound email is
redirected to `TEST_EMAIL_DESTINATION` with a `[TEST]` subject, applied
inside `lib/gmail/safety.ts` immediately before the Gmail API call — there
is no send path around this gate. An optional `FORCE_TEST_MODE=true` env
var locks an environment into test mode and disables the in-app switch
(use on staging).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — structural map: routes, modules, components
- [HARDENING_HANDOFF.md](HARDENING_HANDOFF.md) — current cross-agent hardening
  invariants, changed flows, validation state, and deployment follow-ups
- [PUBLIC_LAUNCH_AUDIT.md](PUBLIC_LAUNCH_AUDIT.md) — sell-today pilot scope,
  public-launch gates, competitor position, and mobile-readiness plan
- [PRODUCT_STRATEGY_2026.md](PRODUCT_STRATEGY_2026.md) — source-backed
  competitor analysis, sending-volume position, product gaps, and P0/P1/P2
  roadmap
- [FEATURES.md](FEATURES.md) — generated, living feature checklist
- [SETUP.md](SETUP.md) — local development and Google Cloud configuration
- [DEPLOYMENT.md](DEPLOYMENT.md) — Cloud Run deployment
- [SECURITY.md](SECURITY.md) — controls and threat notes
- [DATA_MODEL.md](DATA_MODEL.md) — Firestore collections and isolation
- [GOOGLE_OAUTH.md](GOOGLE_OAUTH.md) — the two OAuth layers (app sign-in vs. Gmail send consent) and scopes
- [SALESFORCE_PARSER.md](SALESFORCE_PARSER.md) — paste-format parsing rules
- [CAMPAIGN_SAFETY.md](CAMPAIGN_SAFETY.md) — send-safety gate design
- [ADD_A_COMPANY.md](ADD_A_COMPANY.md) — onboarding a new company/tenant
- [OPERATIONS.md](OPERATIONS.md) · [TESTING.md](TESTING.md) ·
  [USER_GUIDE.md](USER_GUIDE.md) · [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)
- [TODO.md](TODO.md) — outstanding infra/ops follow-ups

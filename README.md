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
**[docs/architecture.md](docs/architecture.md)**. For a live-maintained list of what's
built vs. planned, see **[docs/features.md](docs/features.md)** (also viewable in-app
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
  updates `lib/features/registry.ts`, which regenerates `docs/features.md` and
  is what the in-app `/admin/features` checklist renders — so the doc, the
  generated file, and the live UI can't drift apart.
- **GitHub is the quality gate**: pull requests and pushes to `main` run
  typecheck, lint, unit tests, Firestore emulator isolation tests, a
  production build, and a high-severity production-dependency audit.

See [docs/architecture.md](docs/architecture.md) for the full route/module/component
breakdown, and [docs/data-model.md](docs/data-model.md) for the Firestore schema.

## What's built (summary — see docs/features.md for the live list)

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
| Public site | Outcome-led landing page with interactive product demos, Get started CTAs into sign-in, pricing, and Talk to sales capture |

## Roadmap to public launch

1. Validate Stripe Checkout → webhook → plan flip end to end (test mode),
   then move to live keys. Until then the landing page must keep saying that
   no card is taken, because none is.
2. Google OAuth verification + CASA security assessment (required before
   `SIGNUP_MODE=open` for the general public).
3. Supply the operating entity, address, jurisdiction, retention schedule,
   subprocessors, DPA, and counsel approval for the public legal pages.
4. Build the three surfaces a paying customer will expect and that do not
   exist yet: a support contact path, self-service account and workspace
   deletion, and a data export.
5. Turn on error alerting (`ERROR_WEBHOOK_URL`) + an uptime monitor on
   `/api/health`.
6. Exercise the shipped workspace onboarding, custom-role mapping, team
   hierarchy, guided tour, and dark/light contrast checks with real users.
7. Later "compete" tier: multi-inbox rotation + inbox warmup, contact
   enrichment, LinkedIn/multichannel, SOC 2.

## Quick start

```bash
npm install
cp .env.example .env        # fill in values — see docs/operations/setup.md
npm run dev                 # http://localhost:3000
npm test                    # unit tests — parser, scheduling, eligibility, safety…
npm run test:emulator       # Firestore rules isolation tests (needs Java)
npm run typecheck
npm run lint
npm run build
npm run docs:features       # regenerate docs/features.md after editing the registry
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

Everything lives under **[docs/](docs/README.md)**, which indexes the lot. The
files you are most likely to want:

| Doc | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Routes, modules, components, and how a send travels through the system |
| [docs/features.md](docs/features.md) | Every feature and its status. Generated from `lib/features/registry.ts`, never hand-edited |
| [docs/brand.md](docs/brand.md) | Audience, voice, typography, colour, motion. Read before touching UI or copy |
| [docs/campaign-safety.md](docs/campaign-safety.md) | The guards that stop a bad send |
| [docs/security.md](docs/security.md) | Auth model, token encryption, tenant isolation |
| [docs/data-model.md](docs/data-model.md) | Firestore collections and ownership scoping |
| [docs/operations/setup.md](docs/operations/setup.md) | First-time local and Google Cloud setup |
| [docs/operations/deployment.md](docs/operations/deployment.md) | Deploying to Cloud Run |
| [docs/product/strategy.md](docs/product/strategy.md) | Positioning, competitor analysis, and the launch roadmap |

`AGENTS.md` at the root holds the conventions any agent editing this repo has
to follow: the shared UI components, the token-based theming rules, the
page-composition pattern, and the documentation-upkeep loop.

Point-in-time snapshots (audits, handoffs, readiness reviews) live in
[docs/history/](docs/history/README.md) and are deliberately not maintained.
When one disagrees with a doc in `docs/`, the doc in `docs/` wins.

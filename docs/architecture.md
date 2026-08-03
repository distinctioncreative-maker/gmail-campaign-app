# Architecture

A structural map of Cadence, so anyone can find their way around without
reading the whole codebase first. For *what's built* (feature-level), see
[docs/features.md](docs/features.md). For the Firestore schema, see
[docs/data-model.md](docs/data-model.md).

Every request flow works the same way: an App Router page or `app/api/*`
route calls `requireUser()` / `requireRole()` (`lib/auth/requireUser.ts`) to
resolve a typed `AuthContext`, reads/writes through `lib/repositories/*`
(each doc shape validated against a `schemas/*` Zod schema), and — for
anything that touches Gmail sending — passes through the single safety gate
in `lib/gmail/safety.ts`.

## `app/(dashboard)/*` — the app pages

`app/(dashboard)/layout.tsx` is the shared shell: resolves `requireUser()`,
loads org billing state, builds role-aware nav from
`capabilitiesFor(tenantType, plan)`, and wraps children
in `Sidebar`, `UIProviders` (toast/confirm), `ProductTour`, `NotificationBell`,
`ThemeToggle`.

| Route | What it does |
|---|---|
| `/home` | Personal briefing: greeting, activity pulse chart, campaign status, quick counts. |
| `/campaigns`, `/campaigns/new`, `/campaigns/[campaignId]` | Campaign command center: active, archived, and Recently Deleted lifecycle views; progress and outcome rates; create wizard; controls; configuration; diagnostics; recipients; retained per-campaign KPIs; event log; and dedicated-report links for current campaigns. |
| `/replies` | Cross-campaign reply inbox, triaged by intent, with AI draft + manual scan actions. |
| `/leads`, `/leads/[contactId]`, `/leads/lists/[listId]` | Audience KPI summary, stable cursor pagination, date-added context, tag/list/status filtering, safe bulk organization, single-contact detail/engagement, and named lead lists. |
| `/templates`, `/templates/[templateId]`, `/templates/new` | Reusable email workspace with stable-caret visual/HTML editing, desktop/phone preview, spam check, starter layouts, Gmail draft import, and a compliance-footer helper that cannot bypass launch requirements. |
| `/sequences`, `/sequences/[sequenceId]`, `/sequences/new` | Follow-up sequences (multi-step, auto-stop on reply). |
| `/reports` | Campaign intelligence: all-campaign or single-campaign scope, 30/90/365-day send cohorts, exact all-time KPIs, funnel, timing analysis, tracked-engagement caveats, comparison table, and CSV export. |
| `/deliverability` | SPF/DKIM/DMARC + Postmaster reputation for the sending domain. |
| `/suppressions` | Do-not-email management (personal + org scope). |
| `/team`, `/team/[userId]`, `/team/[userId]/campaigns/[campaignId]` | Cycle-safe parent/child team hierarchy, inherited manager visibility, roster + leaderboard, and read-only member drill-down. |
| `/settings` | Gmail connection status, sender profile/signature, invite teammates. |
| `/system-health` | Admin-only ops view: cron freshness, member Gmail health, sending-mode state, env summary. |
| `/onboarding` | Personalized first-run wizard: workspace profile, Gmail connection, sender identity, responsible defaults, self-test, first-success milestone, and guided-tour handoff. |
| `/help` | Task-first knowledge center, searchable professional guides, expanded FAQ, safe Test Center, feature suggestions, and replayable tour. |
| `/admin`, `/admin/waitlist`, `/admin/features` | Admin console (see below), waitlist signups, live feature checklist. |
| `(auth)/sign-in` | Sign-in (outside the dashboard layout). |

## Public legal and trust routes

`/terms`, `/privacy`, `/acceptable-use`, and `/compliance` are public,
indexable managed-pilot disclosures composed through
`components/legal/LegalPage.tsx`. They describe the controls that exist in
source and explicitly defer unresolved legal identity, jurisdiction, retention,
subprocessor, DPA, deletion/export, and counsel decisions to a signed pilot
agreement. They are a launch baseline, not a substitute for legal approval.

### The admin console specifically

`app/(dashboard)/admin/page.tsx` is **not** a tabbed interface — it's a
linear stack of independent `"use client"` card components, each owning its
own fetch/save cycle against a dedicated `app/api/admin/<feature>/route.ts`
endpoint. Guard clause on every admin surface:

```tsx
const ctx = await requireUser();
const settings = await getOrgSettings(ctx.organizationId);
if (
  ctx.role !== "ADMIN" ||
  !capabilitiesFor(ctx.tenantType, settings.billing.plan).adminConsole
) redirect("/home");
```

Current sections, top to bottom: `WorkspaceNameCard`, `SendingModeCard`,
`AiWritingCard`, `BillingCard`, `InviteTeamCard`, `CustomRolesCard`, a link card to
`/admin/waitlist`, a link card to `/admin/features`, then `AdminPanel`
(member list).

**To add a new admin section**, follow the existing pattern:
1. If it's org policy, extend `getOrgSettings`/`updateOrgSettings`
   (`lib/repositories/orgSettings.ts`) or add a repository function.
2. Add `app/api/admin/<feature>/route.ts` with `GET`/`PATCH` handlers,
   starting with `requireRole("ADMIN")`, wrapped in `handleApiErrors`.
3. Add `components/admin/<Feature>Card.tsx`: fetch state, local `useState`,
   save via `fetchJson` (`lib/fetchJson.ts`), `useToast()` for feedback,
   `router.refresh()` after save.
4. Register it in `admin/page.tsx` as one more stacked block. If it's big
   enough to deserve its own page (like Waitlist or Features), add
   `app/(dashboard)/admin/<feature>/page.tsx` with the same guard clause and
   a link card instead.
5. Gate visibility with `capabilitiesFor(ctx.tenantType,
   settings.billing.plan)` if it should
   differ between Solo and Workspace tenants.

## `app/api/*` — REST routes

Nearly every route wraps its handler in `handleApiErrors` (`lib/api.ts`) and
calls `requireUser()`/`requireRole()` first; bodies are parsed with inline
Zod schemas.

| Group | Covers |
|---|---|
| `auth/session` | Firebase ID token → session cookie exchange, provisions membership. |
| `gmail/*` | OAuth connect/callback/disconnect, connection status, list drafts. |
| `billing/*` | Plan/subscription state, seat-aware Checkout, billing portal, idempotent Stripe webhook. |
| `admin/*` | Org policy CRUD: settings, AI toggle, workspace rename, sending mode, members, and reusable custom role definitions mapped to audited access levels. |
| `ai/brand-memory` | Org brand profile used to steer AI generation. |
| `campaigns/*` | CRUD, launch, controls (pause/resume/cancel/retry/clone/archive/restore), recoverable deletion, permanent deletion only after soft deletion, diagnose, reply scan, undo-unsubscribe. |
| `contacts/*`, `lead-lists/*`, `leads/*` | Owner-scoped contact CRUD, idempotent bulk tag/list operations, lead lists, CSV/Salesforce-paste parsing + import. |
| `sequences/*` | CRUD + AI generation. |
| `templates/*` | CRUD + AI generate/improve/preview/subjects/test-send. |
| `replies/*` | AI draft creation, on-demand mailbox scan. |
| `suppressions` | List/add/deactivate do-not-email entries. |
| `u/[token]` | Public signed one-click unsubscribe confirmation and RFC 8058 POST. GET never mutates recipient state. |
| `teams/*` | Team CRUD, cycle-safe parent hierarchy, inherited manager scope, and membership. |
| `invites` | List/create/revoke invites; can promote Solo → Workspace. |
| `me`, `settings/profile`, `onboarding`, `notifications` | Self-service user state plus admin-only shared workspace setup. Tracked campaigns write one transactional notification for the first detected open per recipient; the notification explicitly warns that email clients may preload images. |
| `feature-suggestions`, `waitlist` | Lightweight feedback board; public landing-page signup capture. |
| `sending-mode` | Read-only current TEST/LIVE state for any signed-in user. |
| `health` | Public readiness probe (Firestore connectivity) for uptime monitors. |
| `tasks/send-message` | Cloud Tasks worker (OIDC-verified) — sends one queued email, atomically commits delivery plus the next durable follow-up, and never retries an ambiguous Gmail result. |
| `cron/sweep` | Cloud Scheduler entry point (OIDC-verified) — reply/bounce sweeps, repair, metrics, and anonymized benchmarks, keyed by `?job=`. |
| `test/[check]` | Backing endpoint for the Help page's Test Center. |

## `lib/*` — modules

| Folder | Responsibility |
|---|---|
| `auth/` | Session/auth-context resolution, sign-in domain policy (`requireUser.ts`, `session.ts`, `domains.ts`). |
| `tenancy/` | Solo vs. Workspace classification and capability matrix (`accountType.ts`, `capabilities.ts`). Custom role names do not change this matrix or the three base access levels. |
| `billing/` | Stripe integration + plan catalog (`stripe.ts`, `plans.ts`) plus shared public pricing copy (`publicPricing.ts`); webhook claims/customer pointers live in `repositories/billing.ts`. |
| `campaigns/` | Core campaign lifecycle: launch, active/archive/deleted partitioning, commercial-email placeholder enforcement, visible unsubscribe insertion, controls, monitoring, repair, diagnose, eligibility, collision, followups, and idempotency (largest module). |
| `gmail/` | Gmail API wrapper + the send-safety gate (`send.ts`, `safety.ts`, `drafts.ts`, `classifyBounce.ts`, `classifyReply.ts`). |
| `google/` | Gmail-connect OAuth mechanics, separate from Firebase app sign-in (`oauth.ts`, `oauthState.ts`). |
| `repositories/` | Firestore data access; every doc validated against a `schemas/*` type. |
| `ai/` | LLM-backed writing features, individually gated (`enabled.ts` is the master switch). |
| `observability/` | `reportError` — structured logs + optional webhook alert. |
| `firebase/` | Admin SDK (`admin.ts`) + browser SDK config (`client.ts`). |
| `kms/` | Encrypt/decrypt stored OAuth refresh tokens. |
| `leads/` | Classification/reconciliation for import flows, bounded import batching, cursor helpers, and normalized contact-tag helpers. |
| `parser/` | Salesforce-paste parsing, email normalization. |
| `personalization/` | Template placeholder rendering. |
| `sanitize/` | HTML sanitization for user-authored email bodies. |
| `tracking/` | Expiring signed tokens plus open/click HTML injection. |
| `unsubscribe/` | Domain-separated signed tokens and public one-click unsubscribe URLs. |
| `benchmarks/` | K-anonymous deliverability aggregation and reads. |
| `scheduling/` | Send-window/day logic. |
| `sending/` | Org-wide TEST/LIVE mode resolution. |
| `spam/` | Spam-risk scoring for template content. |
| `tasks/` | Cloud Tasks enqueue + OIDC verification. |
| `teams/` | Team-scoped access control, cycle-safe hierarchy traversal, inherited manager scope, and stats. |
| `deliverability/` | DNS auth checks + Postmaster stats. |
| `analytics/` | Shared campaign performance math, send-cohort windows, and report visualizations used by Reports, Campaigns, Home, and Replies. |
| `home/` | Home-page briefing composition. |
| `features/` | `registry.ts` — the feature checklist single source of truth (this doc's companion). |
| `util/`, `hooks/` | Generic helpers (concurrency pool, rate limit) and shared client hooks. |
| `env.ts`, `api.ts`, `fetchJson.ts` | Zod-validated env vars; uniform API error handling; typed client fetch helper. |

## `components/*` — organization

Feature-folder based, not atomic-design based:

- **`components/ui/`** — shared primitives: `PageHeader`, `CollapsibleCard`,
  `Icon`, `Logo`, `Skeleton`, `ThemeToggle`, and `UIProviders` (the only true
  global interactive primitives: toast via `useToast`, confirm dialog via
  `useConfirm`).
- **`components/marketing/`** — the public landing page only.
- **Feature folders** — `admin/`, `campaign/`, `sequences/`, `templates/`,
  `leads/`, `team/`, `analytics/`, `replies/`, `imports/`, `home/`, `spam/`,
  `help/`, `tour/`: client components for one dashboard section each.
- **Top level** — cross-page shared pieces that aren't primitives or
  feature-specific: `Sidebar`, `AccountMenu`, `MobileNav`, `NotificationBell`,
  `ContactsTable`, `SuppressionsManager`, `GmailConnectionCard`,
  `OnboardingWizard`, `TestCenter`, etc.

`components/analytics/ReportFilters.tsx` owns the client navigation for
campaign and cohort selectors. The Reports page remains a Server Component:
it validates the requested campaign against the signed-in owner's records,
loads recipient data server-side, and passes only rendered/serialized values
to interactive controls.

Shared `Button` and modal/confirm behavior live in `components/ui/`; common
surface classes (`.card`, `.card-hover`, `.btn-primary`) remain Tailwind
utility compositions in `app/globals.css`.

## `schemas/*` — domain types

Zod schemas double as the runtime validation layer and the TypeScript
source of truth for every Firestore document shape: `common.ts` (shared
primitives + `OwnedRecord`), `user.ts`, `campaign.ts`, `contact.ts`,
`leadList.ts`, `parsedLead.ts`, `sequence.ts`, `suppression.ts`,
`template.ts`, `userSettings.ts`, `gmailConnection.ts`. See
[docs/data-model.md](docs/data-model.md) for how these map to Firestore collections.

## Adding a new admin tab — the short version

There is no tab-registry component today (see "The admin console
specifically" above) — introducing real tabs would be a structural change,
not a drop-in file. Until that changes, follow the "stacked card" or
"linked sub-page" pattern already established.

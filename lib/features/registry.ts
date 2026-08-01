/**
 * Single source of truth for "what Cadence can do."
 *
 * This file is read by two consumers:
 *  - `scripts/generate-features-doc.mts` → regenerates docs/features.md (run via
 *    `npm run docs:features`).
 *  - `app/(dashboard)/admin/features/page.tsx` → renders the same list live
 *    inside the app for admins.
 *
 * Convention (see AGENTS.md "Documentation upkeep"): when you ship, change,
 * or remove a feature, update the relevant entry here first, then run
 * `npm run docs:features`. Do not hand-edit docs/features.md.
 *
 * Kept dependency-free (no "@/..." aliases) so it can be imported both by
 * the Next.js app and by a plain Node script run outside the bundler.
 */

export type FeatureStatus = "shipped" | "beta" | "planned";

export interface FeatureEntry {
  /** Stable slug, kebab-case. Used as a React key; keep it once assigned. */
  id: string;
  name: string;
  status: FeatureStatus;
  /** One or two sentences: what it does and why it matters. */
  description: string;
  /** Key files/folders a developer would touch to change this feature. */
  keyFiles?: string[];
}

export interface FeatureCategory {
  id: string;
  name: string;
  features: FeatureEntry[];
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    id: "auth-tenancy",
    name: "Auth & Tenancy",
    features: [
      {
        id: "firebase-auth-session",
        name: "Google sign-in + server session",
        status: "shipped",
        description:
          "Firebase Auth (Google provider) on the client, exchanged for an HttpOnly Firebase Admin session cookie. jose signs the separate Gmail-connect OAuth state. Every request resolves a typed AuthContext server-side before touching data. Visiting a protected app URL while signed out lands on the marketing site first. A persistent account control now names Switch account and Sign out directly, opens beside the desktop sidebar, and expands inside the scrollable mobile sheet.",
        keyFiles: ["lib/auth/session.ts", "lib/auth/requireUser.ts", "app/api/auth/session", "app/(dashboard)/layout.tsx", "app/(auth)/sign-in/page.tsx", "components/AccountMenu.tsx", "components/Sidebar.tsx", "components/MobileNav.tsx"],
      },
      {
        id: "dual-mode-tenancy",
        name: "Dual-mode tenancy (Solo vs Workspace)",
        status: "shipped",
        description:
          "A custom email domain becomes a shared Workspace org (team, keyed by domain); a consumer provider (gmail.com, outlook.com, etc.) becomes a private Solo workspace keyed per user, so consumers never collide with each other or with a company's Workspace.",
        keyFiles: ["lib/tenancy/accountType.ts", "lib/tenancy/capabilities.ts"],
      },
      {
        id: "signup-modes",
        name: "Allowlist / open signup modes",
        status: "shipped",
        description:
          "SIGNUP_MODE=allowlist (default) restricts sign-in to configured work domains; SIGNUP_MODE=open lets any verified Google account in, routing consumers to isolated Solo workspaces. Open mode is gated behind completed Google OAuth verification.",
        keyFiles: ["lib/env.ts", "lib/auth/domains.ts"],
      },
      {
        id: "solo-to-team-promotion",
        name: "Solo → Team promotion",
        status: "shipped",
        description:
          "A Solo user who invites a teammate has their private workspace promoted into a full Workspace org in place, so growth from self-serve individuals into paying teams needs no migration step. Stripe-backed teams enforce purchased seats transactionally across active members, pending invites, and reactivation.",
        keyFiles: ["lib/repositories/invites.ts", "lib/repositories/orgSettings.ts", "lib/billing/plans.ts"],
      },
      {
        id: "roles",
        name: "Roles (Sales Rep / Manager / Admin)",
        status: "shipped",
        description:
          "Three roles gate what a member can see and do: reps manage their own data, managers see their team, admins control org policy and billing.",
        keyFiles: ["schemas/common.ts", "lib/auth/requireUser.ts"],
      },
    ],
  },
  {
    id: "leads",
    name: "Leads & Import",
    features: [
      {
        id: "salesforce-paste-import",
        name: "Salesforce paste-format import",
        status: "shipped",
        description:
          "Paste a Salesforce list view directly and Cadence parses names, companies, and emails out of the tab/column mess, flagging which rows are valid before import.",
        keyFiles: ["lib/parser/salesforce.ts", "app/api/leads/parse-salesforce"],
      },
      {
        id: "csv-import",
        name: "CSV import with column mapping",
        status: "shipped",
        description: "Upload a CSV, map its columns to contact fields, and preview classification before committing the import.",
        keyFiles: ["lib/leads/csv.ts", "app/api/leads/parse-csv"],
      },
      {
        id: "lead-lists",
        name: "Lead lists",
        status: "shipped",
        description: "Named, deduplicated collections of contacts a rep keeps topping up, separate from the master contacts table.",
        keyFiles: ["schemas/leadList.ts", "lib/repositories/leadLists.ts"],
      },
      {
        id: "lead-command-center",
        name: "Lead command center",
        status: "shipped",
        description: "An enterprise-style contact directory with audience KPI cards, reusable lead lists, searchable status segments with live counts, safe bulk actions, and editable per-lead detail pages with real engagement history and notes.",
        keyFiles: ["app/(dashboard)/leads", "components/ContactsTable.tsx", "lib/leads/engagement.ts"],
      },
      {
        id: "suppressions",
        name: "Suppressions (Do-Not-Email)",
        status: "shipped",
        description: "Personal and org-scoped suppression lists (opt-out, bounce, complaint, manual) are checked before every send. Real campaign messages include a signed RFC 8058 one-click unsubscribe URL; scanner-safe GET requests never mutate state, while confirmed POST requests atomically mark the recipient, update counters, and write a deterministic suppression.",
        keyFiles: ["schemas/suppression.ts", "components/SuppressionsManager.tsx", "lib/unsubscribe/token.ts", "app/api/u/[token]", "lib/repositories/campaigns.ts"],
      },
      {
        id: "sheets-import",
        name: "Google Sheets import",
        status: "planned",
        description: "Deferred intentionally: CSV import covers the file-import case today; the import chooser already reserves the slot.",
      },
    ],
  },
  {
    id: "templates-ai",
    name: "Templates & AI Writing",
    features: [
      {
        id: "templates",
        name: "Reusable templates",
        status: "shipped",
        description: "A wide, responsive email workspace with a full-height visual or HTML composer, desktop and phone preview widths, browser autosave status, word count, spam checks, starter layouts, Gmail draft import, and placeholder personalization in the body and subject line. Imported, restored, AI-generated, pasted, linked, and image content is sanitized before entering the visual editor and again at the server storage boundary.",
        keyFiles: ["schemas/template.ts", "lib/personalization/render.ts", "components/templates/TemplateEditor.tsx"],
      },
      {
        id: "ai-writer",
        name: "AI email writer",
        status: "shipped",
        description: "Describe an email in a sentence and get a ready-to-send, on-brand draft. Env-gated on GEMINI_API_KEY and an org-level admin switch; fully off by default.",
        keyFiles: ["lib/ai/generateEmail.ts", "lib/ai/enabled.ts", "components/admin/AiWritingCard.tsx"],
      },
      {
        id: "brand-memory",
        name: "Brand memory",
        status: "shipped",
        description: "A saved org profile (offer, tone, pitch) that steers every AI-generated email so drafts stay consistent without re-explaining the business each time.",
        keyFiles: ["app/api/ai/brand-memory"],
      },
      {
        id: "ai-improve-subjects",
        name: "AI improve / shorten / subject lines",
        status: "shipped",
        description: "One-click AI edits on an existing draft: tighten it, shorten it, or generate alternate subject lines.",
        keyFiles: ["lib/ai/improveEmail.ts", "app/api/templates/improve", "app/api/templates/subjects"],
      },
      {
        id: "ab-rotation",
        name: "Template A/B rotation",
        status: "shipped",
        description: "Campaigns can rotate between templates and report which variant performs better.",
      },
    ],
  },
  {
    id: "campaigns",
    name: "Campaigns & Sequences",
    features: [
      {
        id: "campaign-wizard",
        name: "Campaign wizard",
        status: "shipped",
        description: "Multi-step flow to pick leads, a template, and a pace, then launch, with validation before anything sends. The email step lets you create or edit a template inline instead of leaving the wizard and coming back. Recipient counts and the launch selection are scoped to the chosen list and only the contacts actually selected. Every initial and A/B rotation template must include the saved physical-address and opt-out placeholders before launch.",
        keyFiles: [
          "lib/campaigns/launch.ts",
          "app/(dashboard)/campaigns/new",
          "components/campaign/CampaignWizard.tsx",
          "lib/campaigns/wizardSelections.ts",
        ],
      },
      {
        id: "cloud-tasks-sending",
        name: "Cloud Tasks sending engine",
        status: "shipped",
        description: "Every send is a queued, OIDC-verified Cloud Task. Launch is transactionally claimed, queue IDs are deterministic, and the worker reserves delivery before calling Gmail; failures after that boundary are marked ambiguous for human review instead of retried into a possible duplicate.",
        keyFiles: ["lib/tasks/enqueue.ts", "app/api/tasks/send-message", "lib/campaigns/launch.ts", "lib/repositories/campaigns.ts"],
      },
      {
        id: "gmail-draft-campaigns",
        name: "Gmail draft-only campaigns",
        status: "shipped",
        description: "Draft-only campaigns create personalized Gmail drafts instead of sending messages. Drafts do not consume send quota, increment sent metrics, or schedule follow-ups.",
        keyFiles: ["lib/gmail/send.ts", "app/api/tasks/send-message", "schemas/campaign.ts"],
      },
      {
        id: "send-windows-caps",
        name: "Send windows, pacing, and daily caps",
        status: "shipped",
        description: "Sends spread across allowed weekdays/hours at a human pace. A transactional, idempotency-keyed quota reservation enforces the plan cap even when Cloud Tasks workers run concurrently, and overflow is re-spread across the next valid day.",
        keyFiles: ["lib/scheduling/window.ts", "lib/billing/plans.ts", "lib/repositories/campaigns.ts", "lib/campaigns/deferral.ts"],
      },
      {
        id: "pace-safety-confirmations",
        name: "\"Are you sure?\" prompts for risky pacing",
        status: "shipped",
        description: "A shared risk check flags unsafe daily volume, minimum delay, and batch size in the wizard and live pace editor. The server independently requires explicit acceptance and always rejects values above the current plan cap; there is no cap-bypass action.",
        keyFiles: ["lib/campaigns/paceSafety.ts", "components/campaign/CampaignWizard.tsx", "components/campaign/CampaignControls.tsx"],
      },
      {
        id: "open-click-tracking",
        name: "Optional open/click tracking",
        status: "shipped",
        description: "Off by default and clearly labeled as a deliverability tradeoff. Expiring, signed tokens drive rate-limited open and click endpoints; redirects are restricted to stored HTTP(S) links, and counters update transactionally under concurrent image/link loads. The first detected open per recipient also creates one transactionally deduplicated in-app notification with a privacy-preloading caveat. The unsubscribe link is never rewritten.",
        keyFiles: [
          "lib/tracking/inject.ts",
          "lib/tracking/token.ts",
          "app/api/t/o/[token]",
          "app/api/t/c/[token]/[index]",
          "lib/analytics/metrics.ts",
          "lib/repositories/notifications.ts",
          "app/(dashboard)/reports/page.tsx",
        ],
      },
      {
        id: "campaign-command-center",
        name: "Campaign command center",
        status: "shipped",
        description: "The campaign list combines status segments, progress, reply rates, problems, and summary KPIs, with purpose-built mobile cards instead of a squeezed desktop table. Each campaign detail view adds an anchored command-center layout, a keyboard-accessible mobile section dialog, initial-send progress, configuration summary, reliable outcome rates, tracked-engagement caveats, controls, recipients, and activity, plus a direct link to its dedicated report.",
        keyFiles: ["app/(dashboard)/campaigns", "components/campaign/CampaignsTable.tsx", "components/campaign/CampaignSectionNav.tsx"],
      },
      {
        id: "campaign-controls",
        name: "Pause / resume / cancel / retry / clone",
        status: "shipped",
        description: "Full lifecycle controls on a running campaign, plus a plain-language health diagnostic when something looks stuck.",
        keyFiles: ["lib/campaigns/controls.ts", "lib/campaigns/diagnose.ts", "lib/campaigns/repair.ts"],
      },
      {
        id: "collision-detection",
        name: "Cross-rep contact collision policy",
        status: "shipped",
        description: "Prevents two reps in the same org from independently emailing the same prospect, with a privacy-preserving collision check.",
        keyFiles: ["lib/campaigns/collision.ts"],
      },
      {
        id: "sequences",
        name: "Follow-up sequences",
        status: "shipped",
        description: "Automatic multi-step follow-ups on a delay that stop when a lead replies. The next queue record commits atomically with the confirmed Gmail result, then Cloud Task publication is repaired from that durable outbox, including delays beyond Cloud Tasks' 30-day maximum. Pause, resume, cancellation, and out-of-office handling keep queue state and actual tasks aligned.",
        keyFiles: ["schemas/sequence.ts", "lib/campaigns/followups.ts", "lib/campaigns/controls.ts", "lib/campaigns/monitoring.ts", "lib/campaigns/repair.ts"],
      },
      {
        id: "ai-sequence-generation",
        name: "AI-assisted sequence drafting",
        status: "shipped",
        description: "Generate a full follow-up sequence from a short prompt, pre-loaded with available templates.",
        keyFiles: ["lib/ai/generateSequence.ts", "app/api/sequences/generate"],
      },
    ],
  },
  {
    id: "replies",
    name: "Replies & Inbox",
    features: [
      {
        id: "reply-triage",
        name: "Reply triage",
        status: "shipped",
        description: "Every reply is classified Interested / Needs reply / Not now automatically, so hot leads float to the top.",
        keyFiles: ["lib/gmail/classifyReply.ts", "app/(dashboard)/replies"],
      },
      {
        id: "ai-reply-drafts",
        name: "AI reply drafts",
        status: "shipped",
        description: "One click drafts an on-brand reply as a real Gmail draft in the actual thread, nothing spoofed or relayed.",
        keyFiles: ["lib/ai/generateReply.ts", "app/api/replies/draft"],
      },
      {
        id: "bounce-handling",
        name: "Bounce detection + unsubscribe handling",
        status: "shipped",
        description: "Automated mailbox scans classify bounces and unsubscribes, updating suppressions so the same mistake doesn't repeat, with an admin undo for accidental unsubscribes. Mailbox outcomes and counters are transactionally claimed so concurrent manual/Scheduler scans cannot double-count them. Also honors a bare \"STOP\" reply.",
        keyFiles: ["lib/gmail/classifyBounce.ts", "lib/campaigns/monitoring.ts", "lib/gmail/classifyReply.ts"],
      },
      {
        id: "reply-reading-view",
        name: "In-app reply reading view",
        status: "shipped",
        description: "Read a lead's full reply thread, live from Gmail, in a modal without leaving the app: not just the cached 280-character snippet, and it works for replies detected before this shipped too since it fetches on demand.",
        keyFiles: ["components/replies/ReplyThreadViewer.tsx", "app/api/campaigns/[campaignId]/recipients/[recipientId]/thread"],
      },
      {
        id: "cron-sweeps",
        name: "Scheduled reply/bounce sweeps",
        status: "shipped",
        description: "Cloud Scheduler triggers periodic, OIDC-verified sweeps so triage happens even when no one is looking, on top of the on-demand scan button.",
        keyFiles: ["app/api/cron/sweep"],
      },
    ],
  },
  {
    id: "deliverability",
    name: "Deliverability",
    features: [
      {
        id: "domain-auth-checks",
        name: "SPF / DKIM / DMARC checks",
        status: "shipped",
        description: "Live DNS lookups confirm the sending domain is properly authenticated, surfaced as pass/fail before you rely on it.",
        keyFiles: ["lib/deliverability/dnsLookup.ts", "app/(dashboard)/deliverability"],
      },
      {
        id: "postmaster-integration",
        name: "Gmail Postmaster Tools integration",
        status: "shipped",
        description: "Pulls domain reputation and spam-rate stats directly from Google, so declining sender reputation is visible before it costs you the inbox.",
        keyFiles: ["lib/deliverability/postmaster.ts"],
      },
      {
        id: "spam-checker",
        name: "Built-in spam-risk checker",
        status: "shipped",
        description: "Scores template content for common spam triggers before it ever gets sent.",
        keyFiles: ["lib/spam/score.ts"],
      },
      {
        id: "deliverability-benchmarks",
        name: "Anonymized deliverability benchmarks",
        status: "beta",
        description: "A scheduled sweep (job=benchmarks) buckets qualifying campaigns (20+ sends) by pacing and content signals, then only surfaces buckets backed by at least 20 campaigns. The deployment setup script now provisions its daily Cloud Scheduler job; production remains beta until that updated script is applied and the first qualifying aggregates exist.",
        keyFiles: ["lib/benchmarks/buckets.ts", "lib/benchmarks/aggregate.ts", "lib/benchmarks/read.ts", "app/api/cron/sweep", "app/(dashboard)/deliverability"],
      },
    ],
  },
  {
    id: "reporting-teams",
    name: "Reporting & Teams",
    features: [
      {
        id: "analytics-dashboard",
        name: "Campaign intelligence reports",
        status: "shipped",
        description: "Reports can compare all campaigns or isolate one campaign, with 30-day, 90-day, and 12-month send cohorts. Decision-ready KPI cards, an initial-send funnel, trend, reply heatmap, best send hours, time to reply, tracked engagement caveats, campaign ranking, and CSV export share consistent performance math across Reports, Campaigns, and Home.",
        keyFiles: ["lib/analytics/metrics.ts", "components/analytics/ReportFilters.tsx", "app/(dashboard)/reports", "app/(dashboard)/home", "app/(dashboard)/campaigns/[campaignId]"],
      },
      {
        id: "team-dashboards",
        name: "Team Lead dashboards + leaderboards",
        status: "shipped",
        description: "Roster management and per-rep leaderboard KPIs (sent, replies, bounces, active campaigns) for managers and admins.",
        keyFiles: ["lib/teams/stats.ts", "components/team"],
      },
      {
        id: "read-only-drilldown",
        name: "Read-only rep drill-down",
        status: "shipped",
        description: "A team lead can inspect one rep's campaigns for coaching without gaining edit access to them.",
        keyFiles: ["lib/teams/access.ts"],
      },
      {
        id: "home-briefing",
        name: "Home page briefing",
        status: "shipped",
        description: "A personal daily briefing: greeting, activity pulse chart, campaign status, and quick counts.",
        keyFiles: ["lib/home/briefing.ts"],
      },
    ],
  },
  {
    id: "billing",
    name: "Billing",
    features: [
      {
        id: "stripe-plans",
        name: "Plan catalog (Free / Starter / Team / Enterprise)",
        status: "shipped",
        description: "Free Solo tier as the self-serve funnel, Starter and Team as self-checkout plans, Enterprise as contact-us. Each plan carries its own daily send cap and minimum seat quantity. Public and authenticated pricing copy reads from one shared model so price and quantity claims cannot drift.",
        keyFiles: ["lib/billing/plans.ts", "lib/billing/publicPricing.ts"],
      },
      {
        id: "stripe-checkout",
        name: "Stripe Checkout + billing portal",
        status: "shipped",
        description: "Env-gated Stripe integration (no STRIPE_SECRET_KEY = no-op). Checkout prevents duplicate subscriptions and under-counted Team seats; active members plus pending invites reserve purchased seats transactionally. Signed webhooks are idempotently claimed, retry transient failures, and reject stale out-of-order plan changes.",
        keyFiles: ["lib/billing/stripe.ts", "app/api/billing", "lib/repositories/billing.ts", "lib/repositories/orgSettings.ts"],
      },
      {
        id: "plan-send-caps",
        name: "Plan-based send caps in the UI",
        status: "shipped",
        description: "The wizard, live pace editor, team/admin surfaces, and send worker all evaluate the stored plan through the shared capability map. The worker is the final authority for daily volume.",
      },
      {
        id: "stripe-live-wiring",
        name: "Stripe test → live wiring end to end",
        status: "beta",
        description: "The source-level Checkout, portal, webhook, plan, and seat controls are implemented. A human with the Stripe account must still wire test keys, validate Checkout → signed webhook → plan/seat flip → portal/cancel end to end, then install live keys.",
      },
    ],
  },
  {
    id: "admin-ops",
    name: "Admin & Operations",
    features: [
      {
        id: "admin-console",
        name: "Admin console",
        status: "shipped",
        description: "Workspace rename, sending-mode toggle with a go-live checklist, AI master switch, billing, invites, and member role/active management, gated by tenancy capability.",
        keyFiles: ["app/(dashboard)/admin/page.tsx", "lib/tenancy/capabilities.ts"],
      },
      {
        id: "sending-safety-gate",
        name: "Sending safety gate (TEST/LIVE)",
        status: "shipped",
        description: "Every outbound email passes through one choke point that redirects to a test address until an admin explicitly flips the org LIVE. No send path exists around it.",
        keyFiles: ["lib/gmail/safety.ts"],
      },
      {
        id: "system-health",
        name: "System health page",
        status: "shipped",
        description: "Admin-only ops view: cron sweep freshness, member Gmail connection health, sending-mode state, and env config summary.",
        keyFiles: ["app/(dashboard)/system-health"],
      },
      {
        id: "help-test-center",
        name: "Help & Test Center",
        status: "shipped",
        description: "A polished knowledge center starts with task shortcuts, professional icons, searchable step-by-step guides, and expanded answers for per-campaign reporting, responsible daily volume, tracked-open notifications, and multi-inbox status. The safe Test Center, feature suggestions, and replayable tour remain available from the same page.",
        keyFiles: ["components/TestCenter.tsx", "components/help/HelpGuides.tsx", "components/help/Faq.tsx", "app/(dashboard)/help"],
      },
      {
        id: "waitlist-admin",
        name: "Pilot-request admin view",
        status: "shipped",
        description: "Admin view of public landing-page pilot requests with CSV export.",
        keyFiles: ["app/(dashboard)/admin/waitlist"],
      },
      {
        id: "feature-checklist-tab",
        name: "In-app feature checklist",
        status: "shipped",
        description: "This page. Renders lib/features/registry.ts live so admins always see an accurate, current feature map without leaving the app.",
        keyFiles: ["app/(dashboard)/admin/features/page.tsx", "lib/features/registry.ts"],
      },
    ],
  },
  {
    id: "observability-infra",
    name: "Observability & Infra",
    features: [
      {
        id: "error-reporting",
        name: "Structured error reporting",
        status: "shipped",
        description: "Errors are logged in structured form and optionally forwarded via ERROR_WEBHOOK_URL. Emails, bearer values, API keys, and token-like fields are redacted before either sink receives them.",
        keyFiles: ["lib/observability/report.ts"],
      },
      {
        id: "health-endpoint",
        name: "/api/health readiness probe",
        status: "shipped",
        description: "Public, unauthenticated endpoint that checks Firestore connectivity, for uptime monitors and deploy verification.",
        keyFiles: ["app/api/health"],
      },
      {
        id: "kms-token-encryption",
        name: "KMS-encrypted Gmail tokens",
        status: "shipped",
        description: "Every stored Gmail refresh token is encrypted with a managed Cloud KMS key, never stored in plain text.",
        keyFiles: ["lib/kms/crypto.ts"],
      },
      {
        id: "deny-by-default-firestore",
        name: "Deny-by-default Firestore rules",
        status: "shipped",
        description: "Direct client access to Firestore is blocked at the database. The server, via the Admin SDK, is the only path in, and it checks every request.",
        keyFiles: ["firestore.rules"],
      },
      {
        id: "github-quality-gate",
        name: "GitHub quality gate",
        status: "shipped",
        description: "Pull requests and main-branch pushes run typecheck, lint, unit tests, Firestore emulator isolation tests on Java 21, a production build, and a high-severity production dependency audit. Dependabot monitors npm and Actions updates.",
        keyFiles: [".github/workflows/ci.yml", ".github/dependabot.yml"],
      },
      {
        id: "error-alerting-on",
        name: "Error alerting turned on in production",
        status: "planned",
        description: "ERROR_WEBHOOK_URL and an uptime monitor against /api/health are configured, but not yet turned on for the production service.",
      },
    ],
  },
  {
    id: "public-site",
    name: "Public Site & Growth",
    features: [
      {
        id: "landing-page",
        name: "Public landing page",
        status: "shipped",
        description: "Conversion-focused, responsive public site for founders, focused sales teams, and agencies. Typography-first navigation, a calmer editorial layout, sharper outcome-led copy, restrained surfaces, and clearer section hierarchy make the offer feel more credible without sacrificing speed. A premium motion system makes the lead-to-reply workflow visible immediately through a stage clock, live action rail, coordinated product feedback, pointer-responsive lighting, and progressive section reveals without adding a motion dependency. User-controlled examples retain keyboard, touch, reduced-motion, browser-visibility, and off-screen pause behavior. Every pilot call to action centers and focuses the request field, and shared pricing, consent, tracking, safety, and deliverability limits remain explicit without unsupported performance claims.",
        keyFiles: ["components/marketing/Landing.tsx", "components/marketing/landing.module.css", "app/layout.tsx", "app/opengraph-image.tsx"],
      },
      {
        id: "public-seo-security",
        name: "Public SEO and browser security baseline",
        status: "shipped",
        description: "Structured metadata, a generated social preview, robots and sitemap routes, canonical app metadata, and global browser security headers cover the public and authenticated surfaces. The policy preserves Google sign-in popups and public email tracking while denying framing, unsafe object embeds, and unnecessary browser capabilities.",
        keyFiles: ["app/layout.tsx", "app/opengraph-image.tsx", "app/robots.ts", "app/sitemap.ts", "next.config.ts"],
      },
      {
        id: "waitlist-capture",
        name: "Private-pilot capture",
        status: "shipped",
        description: "Public, unauthenticated, rate-limited endpoint that records private-pilot requests from the landing page.",
        keyFiles: ["app/api/waitlist"],
      },
      {
        id: "oauth-verification-casa",
        name: "Google OAuth verification + CASA assessment",
        status: "planned",
        description: "Required security review before SIGNUP_MODE=open can go live for the general public, not just allowlisted domains.",
      },
      {
        id: "legal-pages",
        name: "ToS / Privacy / DPA pages",
        status: "planned",
        description: "Legal pages required for self-serve public launch.",
      },
      {
        id: "generalized-onboarding",
        name: "Generalize copy/onboarding beyond sales",
        status: "planned",
        description: "Broaden product messaging and first-run onboarding beyond the sales-outreach framing to serve founders, marketers, recruiters, agencies, fundraising, partnerships, and newsletters equally.",
      },
      {
        id: "multi-inbox-warmup",
        name: "Multi-inbox rotation + inbox warmup",
        status: "planned",
        description: "Scale sending volume safely across multiple connected inboxes with gradual warmup, a compete-tier feature for later.",
      },
      {
        id: "contact-enrichment",
        name: "Contact enrichment via API",
        status: "planned",
        description: "Enrich imported leads with third-party firmographic/contact data.",
      },
      {
        id: "multichannel",
        name: "LinkedIn / multichannel outreach",
        status: "planned",
        description: "Extend outreach beyond email into other channels.",
      },
      {
        id: "soc2",
        name: "SOC 2",
        status: "planned",
        description: "Formal compliance certification for enterprise buyers, later-stage.",
      },
    ],
  },
  {
    id: "design-system",
    name: "Design System & Motion",
    features: [
      {
        id: "button-motion-system",
        name: "Button hover/press/loading/success states",
        status: "beta",
        description: "Every existing .btn-primary/.btn-secondary/.btn-ghost/.btn-danger button app-wide gained a hover lift from a single app/globals.css change. A new shared components/ui/Button.tsx adds a real loading spinner and a success flash for async actions, replacing plain disabled-only feedback. Rolled out to campaign controls and the template editor first, then a follow-up pass replaced ~15 more hand-rolled buttons across Suppressions, Onboarding, Test Center, admin cards, and the campaign wizard that duplicated the .btn-primary/.btn-ghost/.btn-danger styling inline instead of using the shared classes: losing the hover lift and, in one case (a destructive Gmail-disconnect button), using a dark-mode-unsafe color shade in the process.",
        keyFiles: ["components/ui/Button.tsx", "app/globals.css", "components/campaign/CampaignControls.tsx", "components/templates/TemplateEditor.tsx", "components/SuppressionsManager.tsx"],
      },
      {
        id: "light-dark-theme",
        name: "Light/dark theme",
        status: "shipped",
        description: "Toggle in the top bar, persisted to localStorage with a no-flash inline script honoring OS preference on first visit. Fixed a hydration error from raw (server-timezone) date formatting that silently reverted the whole app to light mode on affected page loads (now uses the existing LocalTime component), and a pre-existing layout bug where Reports chart bars rendered at 0 height in both themes (percentage height inside a non-stretching flex item). Migrated all ~750 hardcoded slate/white Tailwind classes across ~80 files to semantic tokens (bg-surface, bg-surface-2, text-foreground, text-muted, border-border) registered in @theme inline, replacing the old manually-maintained dark-mode override list, which was easy to under-cover. Later found the same under-coverage in status-tint colors (text-red-800, border-amber-300, etc. were never in the override table at all) affecting toasts, the site-wide test-mode banner, and several danger/warning panels: added token-driven .alert-danger/.alert-success/.alert-warning classes plus the existing text-danger/text-warning/border-danger Tailwind utilities as the fix, and corrected AGENTS.md's now-inaccurate claim that status tints were fully covered.",
        keyFiles: ["app/globals.css", "components/ui/ThemeToggle.tsx", "components/LocalTime.tsx", "components/analytics/Charts.tsx", "components/ui/UIProviders.tsx", "AGENTS.md"],
      },
      {
        id: "shared-empty-states-motion",
        name: "Shared empty states, animated counters, staggered entrances",
        status: "shipped",
        description: "A shared components/ui/EmptyState.tsx replaces ad hoc empty-state markup everywhere. It now has two variants: a full brand moment for a surface a customer has not used yet (medallion in a soft halo, display-face title, optional secondary path) and an inline one-liner for sub-panels, which absorbed the six hand-rolled muted-text panels left across Reports, Team, lead lists, and admin. Copy leads with the outcome rather than the mechanism. The home page's count-up number component moved to components/ui/CountUp.tsx (it was never home-specific) and drives KPI tiles app-wide. List and grid rows get a staggered fade-in entrance instead of appearing all at once.",
        keyFiles: ["components/ui/EmptyState.tsx", "components/ui/CountUp.tsx", "app/(dashboard)/reports/page.tsx", "app/(dashboard)/team/page.tsx", "app/(dashboard)/sequences/page.tsx"],
      },
      {
        id: "stat-tile-system",
        name: "One KPI treatment across the app",
        status: "shipped",
        description: "Nineteen KPI tiles had been hand-built across thirteen pages, each with its own type size, chip colour, and spacing, which was a large part of why the app read as unpolished. components/ui/StatTile.tsx now owns the treatment: display face, tight tracking, tabular figures so digits do not jitter as values update, an optional icon chip, an optional link affordance, and a shared staggered grid. A tile's tone drives both the number and its chip, so pages pass meaning rather than colour classes, and the revenue accent stays rationed to money moments (replies, interested leads) per docs/brand.md. Soft surface tokens for success, warning, and danger were added in both themes so status chips no longer reach for literal Tailwind palette classes.",
        keyFiles: ["components/ui/StatTile.tsx", "app/globals.css", "app/(dashboard)/home/page.tsx", "app/(dashboard)/reports/page.tsx", "app/(dashboard)/campaigns/[campaignId]/page.tsx", "docs/brand.md"],
      },
      {
        id: "launch-moment",
        name: "Campaign launch moment",
        status: "shipped",
        description: "Launching a campaign used to be a silent redirect, so the most consequential action in the product felt like a page load. It now lands on a banner that names what is happening (how many personalized emails are queued, that they send from the customer's own Gmail at the pace they set) and where the payoff will show up. The banner strips its own launched flag from the URL on mount, so a refresh or a shared link never re-celebrates a campaign that has been running for a week.",
        keyFiles: ["components/campaign/LaunchCelebration.tsx", "components/campaign/CampaignWizard.tsx", "app/(dashboard)/campaigns/[campaignId]/page.tsx"],
      },
      {
        id: "outreach-trend-chart",
        name: "Reports hero chart",
        status: "shipped",
        description: "The outreach trend was a strip of 3px bars with replies plotted on the send-volume axis, which flattened every reply into the baseline and made the chart unreadable. It is now the hero of the Reports page: a filled volume area under a smooth Catmull-Rom curve, replies on their own scale as a second line with per-day markers, labelled gridlines, and date ticks. Dependency-free SVG rendered on the server. Geometry was verified against single-point, two-point, zero-reply, and empty inputs.",
        keyFiles: ["components/analytics/Charts.tsx", "app/(dashboard)/reports/page.tsx"],
      },
      {
        id: "page-composition-pattern",
        name: "Pages compose, they do not compute",
        status: "shipped",
        description: "Reports (646 lines) and Home (416) each interleaved data loading, aggregation, and several hundred lines of JSX in one file, so neither half could be read without scrolling past the other and none of the arithmetic could be tested without a Firestore stub. Both split three ways: a lib module owning the loading plus pure exported helpers, a Sections component file owning the presentational blocks, and a page that parses params and composes. 21 tests now cover arithmetic that was previously unreachable, including follow-ups counting toward total sends but not initial sends, funnel percentages never dividing by zero or exceeding 100%, leaderboard ties breaking toward the larger sample, and reply rate computed off the selected range rather than all-time.",
        keyFiles: ["lib/analytics/report.ts", "lib/home/dashboard.ts", "components/analytics/ReportSections.tsx", "components/home/HomeSections.tsx", "tests/unit/report-aggregation.test.ts", "tests/unit/home-dashboard.test.ts"],
      },
      {
        id: "enterprise-workspace-layout",
        name: "Enterprise workspace layout and copy standards",
        status: "shipped",
        description: "Dashboard content can use a 1440px workspace for dense reporting and editing without clipping. Shared editorial neutrals, refined card and focus treatments, typography-first navigation, consistent page headers, calmer empty states, and 44px mobile controls unify the public and authenticated product. Core onboarding, import, campaign, AI, reply, and health journeys use the shared line-icon language instead of decorative emoji. Source-level regression tests preserve the navigation, touch-target, icon, and no-em-dash standards.",
        keyFiles: ["app/globals.css", "app/(dashboard)/layout.tsx", "components/ui/Logo.tsx", "components/ui/PageHeader.tsx", "components/MobileNav.tsx", "tests/unit/premium-design-system.test.ts", "tests/unit/copy-style.test.ts"],
      },
      {
        id: "public-marketing-contrast",
        name: "Public marketing contrast system",
        status: "shipped",
        description: "The public landing page uses a theme-invariant warm neutral ramp from the shared brand tokens, with no literal hex colors left in its component stylesheet. Foreground, muted, and on-ink text pairs are regression-tested at WCAG AA contrast, while dark marketing bands use warm off-whites that remain visually consistent with the paper surfaces.",
        keyFiles: ["app/globals.css", "components/marketing/landing.module.css", "docs/brand.md", "tests/unit/landing-experience.test.ts"],
      },
    ],
  },
];

/** Flat list, convenient for consumers that don't care about grouping. */
export const FEATURES: FeatureEntry[] = FEATURE_CATEGORIES.flatMap((c) => c.features);

export function countByStatus(): Record<FeatureStatus, number> {
  const counts: Record<FeatureStatus, number> = { shipped: 0, beta: 0, planned: 0 };
  for (const f of FEATURES) counts[f.status] += 1;
  return counts;
}

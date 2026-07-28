/**
 * Single source of truth for "what Cadence can do."
 *
 * This file is read by two consumers:
 *  - `scripts/generate-features-doc.mts` → regenerates FEATURES.md (run via
 *    `npm run docs:features`).
 *  - `app/(dashboard)/admin/features/page.tsx` → renders the same list live
 *    inside the app for admins.
 *
 * Convention (see AGENTS.md "Documentation upkeep"): when you ship, change,
 * or remove a feature, update the relevant entry here first, then run
 * `npm run docs:features`. Do not hand-edit FEATURES.md.
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
          "Firebase Auth (Google provider) on the client, exchanged for an HttpOnly session cookie signed with jose. Every request resolves a typed AuthContext server-side before touching data. Visiting a protected app URL while signed out (a bookmark, a stale tab, a brand-new visitor) lands on the marketing site first, not a bare login form; the sign-in page itself carries the same brand-gradient/aurora treatment as the signed-in dashboard.",
        keyFiles: ["lib/auth/session.ts", "lib/auth/requireUser.ts", "app/api/auth/session", "app/(dashboard)/layout.tsx", "app/(auth)/sign-in/page.tsx"],
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
          "A Solo user who invites a teammate has their private workspace promoted into a full Workspace org in place, so growth from self-serve individuals into paying teams needs no migration step.",
        keyFiles: ["lib/repositories/invites.ts"],
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
        description: "Editable per-lead detail pages with real engagement counters (emails sent, times replied), notes, Do-Not-Email, and delete.",
        keyFiles: ["app/(dashboard)/leads", "lib/leads/engagement.ts"],
      },
      {
        id: "suppressions",
        name: "Suppressions (Do-Not-Email)",
        status: "shipped",
        description: "Personal and org-scoped suppression lists (opt-out, bounce, complaint, manual) checked before every send.",
        keyFiles: ["schemas/suppression.ts", "components/SuppressionsManager.tsx"],
      },
      {
        id: "sheets-import",
        name: "Google Sheets import",
        status: "planned",
        description: "Deferred intentionally — CSV import covers the file-import case today; the import chooser already reserves the slot.",
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
        description: "Visual editor, starter templates, pasted HTML, or import straight from a Gmail draft, with placeholder personalization in both the body and the subject line (same \"Insert placeholder\" menu on each, same render + launch-validation path). The body editor is a spacious full-height composer, not a cramped box.",
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
        description: "Multi-step flow to pick leads, a template, and a pace, then launch, with validation before anything sends. The email step lets you create or edit a template inline (the same TemplateEditor embedded in place) instead of leaving the wizard and coming back. Recipient counts and the launch selection are scoped to the chosen list and only the contacts actually selected, so the safety-check step and the resulting campaign never show an inflated \"excluded\" count for people who were simply never picked.",
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
        description: "Every send is a queued, OIDC-verified Cloud Task, processed by an idempotent worker that retries pre-send failures and never double-sends.",
        keyFiles: ["lib/tasks/enqueue.ts", "app/api/tasks/send-message", "lib/campaigns/idempotency.ts"],
      },
      {
        id: "send-windows-caps",
        name: "Send windows, pacing, and daily caps",
        status: "shipped",
        description: "Sends spread across allowed weekdays/hours at a human pace, capped per plan, to stay under Gmail's limits and out of spam folders.",
        keyFiles: ["lib/scheduling/window.ts", "lib/billing/plans.ts"],
      },
      {
        id: "pace-safety-confirmations",
        name: "\"Are you sure?\" prompts for risky pacing",
        status: "shipped",
        description: "A shared risk check (daily volume, minimum delay, batch size against the app's own \"boring volume\" deliverability guidance) flags unsafe settings inline in the campaign wizard and CampaignControls' pace editor, and gates launch / saving a live campaign's pace / the one-click daily-limit override behind an explicit confirm dialog naming the specific risk.",
        keyFiles: ["lib/campaigns/paceSafety.ts", "components/campaign/CampaignWizard.tsx", "components/campaign/CampaignControls.tsx"],
      },
      {
        id: "open-click-tracking",
        name: "Optional open/click tracking",
        status: "shipped",
        description: "Off by default, opt-in per campaign in the wizard, clearly labeled as a deliverability tradeoff. A signed, tamper-evident token (not a client-supplied URL) drives both the open pixel and the click-redirect endpoint, which only ever redirects to a destination looked up server-side from the recipient's own stored links — never an open redirect. The unsubscribe link is never rewritten. Open and click rates surface on the Reports page (scoped only to tracking-enabled campaigns, so untracked campaigns never dilute the rate toward zero) and as raw counts on each campaign's detail page.",
        keyFiles: [
          "lib/tracking/inject.ts",
          "lib/tracking/token.ts",
          "app/api/t/o/[token]",
          "app/api/t/c/[token]/[index]",
          "lib/analytics/metrics.ts",
          "app/(dashboard)/reports/page.tsx",
        ],
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
        description: "Automatic multi-step follow-ups on a delay, that stop the moment a lead replies.",
        keyFiles: ["schemas/sequence.ts", "lib/campaigns/followups.ts"],
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
        description: "Automated mailbox scans classify bounces and unsubscribes, updating suppressions so the same mistake doesn't repeat, with an admin undo for accidental unsubscribes. Also honors a bare \"STOP\" reply, the universal SMS/email opt-out convention, which previously fell through to a generic human reply.",
        keyFiles: ["lib/gmail/classifyBounce.ts", "lib/campaigns/monitoring.ts", "lib/gmail/classifyReply.ts"],
      },
      {
        id: "reply-reading-view",
        name: "In-app reply reading view",
        status: "shipped",
        description: "Read a lead's full reply thread, live from Gmail, in a modal without leaving the app — not just the cached 280-character snippet, and it works for replies detected before this shipped too since it fetches on demand.",
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
        description: "A scheduled sweep (job=benchmarks) buckets every user's qualifying campaigns (20+ sends) by pacing and content signals — batch size, daily limit, delay, images, links, spam score, length, subject length, personalization — and averages their outcomes. A bucket only ever surfaces once it has 20+ campaigns behind it (k-anonymity), so no published number can be traced to one user. Shown on the Deliverability page with a \"your default vs. the best bucket\" comparison, and folded into the campaign wizard's pace-risk warning as a data-backed line once available. Needs its own Cloud Scheduler job pointed at /api/cron/sweep?job=benchmarks (see the other outreach-* jobs) — code-complete but not yet scheduled to run.",
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
        name: "Analytics dashboard",
        status: "shipped",
        description: "Totals, time-to-reply, a reply heatmap, best-send-times, and a daily trend chart, with CSV export. \"Emails sent\" is standardized everywhere (Home, campaign detail, Reports) as initial + follow-up sends via lib/analytics/metrics.ts's totalSent()/replyRateForCampaign() helpers, so the same campaign never shows two different totals across pages.",
        keyFiles: ["lib/analytics/metrics.ts", "app/(dashboard)/reports", "app/(dashboard)/home", "app/(dashboard)/campaigns/[campaignId]"],
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
        description: "Free Solo tier as the self-serve funnel, Starter and Team as self-checkout plans, Enterprise as contact-us. Each plan carries its own daily send cap.",
        keyFiles: ["lib/billing/plans.ts"],
      },
      {
        id: "stripe-checkout",
        name: "Stripe Checkout + billing portal",
        status: "shipped",
        description: "Env-gated Stripe integration (no STRIPE_SECRET_KEY = no-op, pricing shows \"coming soon\"). A dependency-free REST client handles checkout session creation, the billing portal, and webhook signature verification.",
        keyFiles: ["lib/billing/stripe.ts", "app/api/billing"],
      },
      {
        id: "plan-send-caps",
        name: "Plan-based send caps in the UI",
        status: "shipped",
        description: "The sending-mode/go-live checklist and campaign wizard reflect the org's actual plan limit, not a hardcoded number.",
      },
      {
        id: "stripe-live-wiring",
        name: "Stripe test → live wiring end to end",
        status: "beta",
        description: "Test-mode keys are wired locally; validating Checkout → webhook → plan flip end to end, then moving to live keys, is in progress.",
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
        description: "Guides and FAQ are grouped into task-first sections (Getting started, Sending & follow-ups, Replies & reporting, Leads & deliverability, Team & admin) with a single search box that filters both live. Each Test Center check states in one line what it verifies, what a pass means, and what to do on failure, before you even run it — a safe self-test suite (send a test email, parse sample data, classify a sample reply/bounce). Plus a feature-suggestion box and a replayable product tour.",
        keyFiles: ["components/TestCenter.tsx", "components/help/HelpGuides.tsx", "components/help/Faq.tsx", "app/(dashboard)/help"],
      },
      {
        id: "waitlist-admin",
        name: "Waitlist admin view",
        status: "shipped",
        description: "Admin view of public landing-page early-access signups with CSV export.",
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
        description: "Errors are logged in structured form and optionally forwarded to a webhook (Slack, Sentry ingest, etc.) via ERROR_WEBHOOK_URL.",
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
        description: "Apple-keynote register: true black, San Francisco system type at real scale (no serif, no gold), Apple's own HIG system colors (blue/green/purple) as the entire palette, and real glass (backdrop-blur, not just a tint) on every card. The hero animation is a single calm breathing orb with an occasional traveling pulse along one quiet arc, not a busy particle field, with all labeling in crisp HTML rather than canvas text. Deliverability stat band and FAQ cite tuned, data-backed pacing and tease the anonymized benchmarks feature.",
        keyFiles: ["components/marketing/Landing.tsx", "components/marketing/landing.module.css"],
      },
      {
        id: "waitlist-capture",
        name: "Waitlist capture",
        status: "shipped",
        description: "Public, unauthenticated, rate-limited endpoint that records early-access signups from the landing page.",
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
        description: "Every existing .btn-primary/.btn-secondary/.btn-ghost/.btn-danger button app-wide gained a hover lift from a single app/globals.css change. A new shared components/ui/Button.tsx adds a real loading spinner and a success flash for async actions, replacing plain disabled-only feedback. Rolled out to campaign controls and the template editor first; the rest of the app's action buttons are next.",
        keyFiles: ["components/ui/Button.tsx", "app/globals.css", "components/campaign/CampaignControls.tsx", "components/templates/TemplateEditor.tsx"],
      },
      {
        id: "light-dark-theme",
        name: "Light/dark theme",
        status: "shipped",
        description: "Toggle in the top bar, persisted to localStorage with a no-flash inline script honoring OS preference on first visit. Fixed a hydration error from raw (server-timezone) date formatting that silently reverted the whole app to light mode on affected page loads (now uses the existing LocalTime component), and a pre-existing layout bug where Reports chart bars rendered at 0 height in both themes (percentage height inside a non-stretching flex item). Then migrated all ~750 hardcoded slate/white Tailwind classes across ~80 files to semantic tokens (bg-surface, bg-surface-2, text-foreground, text-muted, border-border) registered in @theme inline, replacing the old manually-maintained dark-mode override list, which was easy to under-cover. AGENTS.md documents the token table so new code doesn't reintroduce hardcoded colors.",
        keyFiles: ["app/globals.css", "components/ui/ThemeToggle.tsx", "components/LocalTime.tsx", "components/analytics/Charts.tsx", "AGENTS.md"],
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

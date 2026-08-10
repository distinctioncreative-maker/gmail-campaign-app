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
        id: "session-revocation",
        name: "Sign out everywhere",
        status: "shipped",
        description:
          "A session cookie lasts five days, so a cookie copied off a shared or stolen laptop stayed usable for five days and nobody could end it early: clearing it in one browser does nothing to a copy elsewhere. Settings now carries an all-or-nothing revocation that ends every session for the account including the caller's own, since sparing the current browser would leave the most recently used session alive, which is backwards if the reason for pressing it is a device that is no longer yours. The implementation is deliberately not a version counter on the user document, which would have meant a Firestore read on the authentication path of every request to reimplement a check that already runs: the session cookie is verified with checkRevoked, so Firebase was already validating every request against the account's tokensValidAfterTime and the only thing missing was anything that ever set it. One call sets it, no per-request cost is added, and there is no second source of truth to drift. The recorded timestamp is display metadata that no access decision reads, and a test asserts that stays true, because a default on a field added after documents exist would otherwise be indistinguishable from a real revocation. The purge revokes too, so a cookie issued before a deletion cannot quietly re-provision an account without anyone signing in again, while merely scheduling a deletion does not revoke: the grace period exists for changing your mind, and signing someone out at that moment makes cancelling harder than requesting. What this cannot do is list the sessions being ended, because Firebase does not expose the cookies it has issued, and the card says so rather than showing an invented device list someone would rely on.",
        keyFiles: [
          "lib/auth/sessions.ts",
          "app/api/account/sessions/route.ts",
          "components/account/SessionsCard.tsx",
        ],
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
        name: "Audited access levels and custom roles",
        status: "shipped",
        description:
          "Three server-enforced permission levels gate what a member can see and do: members manage their own data, managers see explicitly assigned teams, and administrators control workspace policy and billing. Administrators can create reusable role names that map to one audited level; changing a title can never invent or silently elevate permissions.",
        keyFiles: ["schemas/common.ts", "schemas/user.ts", "lib/auth/requireUser.ts", "app/api/admin/custom-roles", "components/admin/CustomRolesCard.tsx"],
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
        id: "lead-tags-and-segmentation",
        name: "Lead tags and reusable segmentation",
        status: "shipped",
        description: "Owner-scoped tags let reps label leads, filter the directory and campaign picker, and organize selected leads across tags and saved lead lists. Bulk list membership updates and deletions reconcile denormalized list counts transactionally, while repeated requests remain idempotent.",
        keyFiles: ["lib/leads/tags.ts", "components/ContactsTable.tsx", "components/leads/BulkLeadOrganizer.tsx", "app/api/contacts/bulk/route.ts"],
      },
      {
        id: "lead-command-center",
        name: "Lead command center",
        status: "shipped",
        description: "An enterprise-style contact directory with audience KPI cards, reusable lead lists and tags, searchable status segments with live counts, safe bulk actions, visible date-added context, and editable per-lead detail pages with real engagement history and notes. Stable cursor pagination keeps the directory responsive without imposing an application-wide total-lead cap, while imports are split into bounded server-safe batches.",
        keyFiles: ["app/(dashboard)/leads", "components/ContactsTable.tsx", "components/leads/LeadDirectoryPagination.tsx", "lib/leads/contactPagination.ts", "lib/leads/importBatching.ts", "lib/leads/engagement.ts"],
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
        description: "A wide, responsive email workspace with a full-height visual or HTML composer, stable caret and selection behavior, desktop and phone preview widths, browser autosave status, word count, spam checks, starter layouts, Gmail draft import, and placeholder personalization in the body and subject line. A default-on compliance helper inserts address and unsubscribe placeholders; users may provide equivalent custom footer copy, but cannot remove the underlying launch requirements. Imported, restored, AI-generated, pasted, linked, and image content is sanitized at preview, test, and storage boundaries.",
        keyFiles: ["schemas/template.ts", "lib/personalization/render.ts", "lib/campaigns/compliance.ts", "components/templates/TemplateEditor.tsx"],
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
        name: "Separate open and click tracking, both off by default",
        status: "shipped",
        description: "Open tracking and click tracking are independent campaign settings and both start off, because they are different trades and neither should be silently accepted on a customer's behalf. The open pixel is a remote image in a cold email in exchange for a figure Apple Mail Privacy Protection has already made mostly directional, and every rewritten click link points at one hostname shared by the whole platform, so one sender's reputation problem would travel in everyone else's mail. Each toggle states its tradeoff in the wizard and campaigns created before the split keep whatever their single old flag said. Expiring, signed tokens drive rate-limited endpoints; redirects are restricted to stored HTTP(S) links, and counters update transactionally under concurrent image or link loads. The first detected open per recipient creates one transactionally deduplicated in-app notification with a privacy-preloading caveat. An opt-out link is never rewritten or counted as a click, whether the word appears in its address or only in the text the reader sees.",
        keyFiles: [
          "lib/tracking/settings.ts",
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
        description: "The campaign list combines active, archived, and Recently Deleted views with progress, reply rates, problems, and summary KPIs, using purpose-built mobile cards instead of a squeezed desktop table. Soft-deleted campaigns retain their deletion date and historical KPIs for recovery or permanent removal, but are excluded from current workspace totals and reports. Each campaign detail view adds an anchored command-center layout, a keyboard-accessible mobile section dialog, initial-send progress, configuration summary, reliable outcome rates, tracked-engagement caveats, recipients, and activity.",
        keyFiles: ["app/(dashboard)/campaigns", "components/campaign/CampaignsTable.tsx", "components/campaign/CampaignSectionNav.tsx", "lib/campaigns/lifecycle.ts"],
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
        id: "deal-outcomes",
        name: "Deal outcomes and revenue reporting",
        status: "shipped",
        description:
          "Mark a reply Meeting booked, Won, or Lost from the inbox, with an optional deal value, and the reports funnel extends from Sent and Replied through Meetings to Won with revenue, close rate, and revenue per email. Outcomes are only ever set by a human: nothing is inferred from message text, because a wrong revenue number is worse than a missing one. Campaign rollups are kept correct by a read-then-delta transaction, so correcting a value, moving a win to a loss, or undoing a mis-click unwinds exactly what the previous state contributed. A win with an unknown value stays countable, and the outcome sections stay hidden until a workspace records one.",
        keyFiles: [
          "lib/campaigns/outcomes.ts",
          "app/api/campaigns/[campaignId]/recipients/[recipientId]/outcome/route.ts",
          "components/replies/OutcomeControl.tsx",
          "tests/unit/deal-outcomes.test.ts",
        ],
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
        id: "address-verification",
        name: "Address verification at import",
        status: "shipped",
        description:
          "Every imported address is checked before it is saved: an MX lookup proves the domain can receive mail at all, a typo check offers a correction for the domains people actually mistype, throwaway providers are rejected, and role inboxes are flagged rather than dropped. Import previously validated syntax and nothing else, so dead domains and typos were invisible until the bounces arrived. This is the preventive half of the bounce problem and the bounce brake is the reactive half; an address never sent to cannot damage a reputation. Undeliverable rows cannot be selected, risky rows import but arrive unticked. One DNS query per distinct domain rather than per address, cached, bounded in concurrency, and with a timeout that returns unknown rather than failure, because treating a slow resolver as a dead domain would quietly delete good leads. No paid verification service and no address leaves the server.",
        keyFiles: [
          "lib/leads/verify.ts",
          "lib/leads/mx.ts",
          "lib/leads/verifyBatch.ts",
          "tests/unit/lead-verify.test.ts",
        ],
      },
      {
        id: "inbox-warmup",
        name: "Inbox warmup ramp",
        status: "shipped",
        description:
          "A newly connected Gmail is capped at 20 sends a day, climbing to 40, 60, 100, and 150 over four weeks before the ceiling lifts. Providers weight a sudden appearance of bulk mail from an address with no sending history heavily, and an inbox connected five minutes ago could previously send a hundred cold emails on day one. The cap composes with the campaign limit and the plan cap by taking the lowest, so it only ever lowers a limit a customer already chose. An unreadable or missing connection date is treated as brand new, because a wrongly strict ceiling costs some throughput while a wrongly absent one costs the domain. Anchored on connection date rather than first send, a known simplification recorded in the source.",
        keyFiles: [
          "lib/campaigns/warmup.ts",
          "app/api/tasks/send-message/route.ts",
          "tests/unit/warmup.test.ts",
        ],
      },
      {
        id: "bounce-brake",
        name: "Automatic stop on a high bounce rate",
        status: "shipped",
        description:
          "A campaign pauses itself when its bounce rate crosses 5% over at least 20 sends, with a warning from 2%. Bounces were previously counted and displayed and acted on by nothing, so a campaign built from a stale list hard-bounced its way to completion at full speed. The sample floor matters as much as the rate: one bounce in three is 33% and means nothing, and a brake that fires on noise is one customers learn to ignore. Thresholds are customizable, and clamped: a customer can make the brake tighter than default but never looser than a hard ceiling, because a brake that can be switched off is not a safety feature and the sending reputation at stake is partly the platform's. Checked once per bounce batch, so one pause and one notification rather than one per address.",
        keyFiles: [
          "lib/campaigns/bounceGuard.ts",
          "lib/campaigns/monitoring.ts",
          "tests/unit/bounce-guard.test.ts",
        ],
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
        description: "Scores template content for common spam triggers before it ever gets sent, including whether the email varies at all between recipients and whether its variation syntax is well formed.",
        keyFiles: ["lib/spam/score.ts"],
      },
      {
        id: "api-keys",
        name: "Workspace API keys",
        status: "shipped",
        description: "Hashed, scoped API keys per workspace with Bearer authentication, admin-only management, and a versioned public endpoint at /api/v1/leads for listing and creating contacts. The raw key is never stored, only its SHA-256, so a database dump or a stray log line can never yield a working credential; the cost is that a key is displayed exactly once at creation and the interface is built around that rather than around working past it. The stored document is keyed by the hash itself, which makes verification a single point read with no candidate scanning and no way for the number of comparisons to depend on how much of a guessed key was correct. Scopes are deny-by-default and a write scope never implies its read, because an integration granted permission to push contacts in has not thereby been granted permission to read the whole list back out. Each key records the owner whose data it addresses separately from the person who created it, so an integration keeps working when that person leaves. Creating a lead through the API is idempotent on the address, matching the CSV import, so a retried request after a timeout cannot duplicate a contact. The public namespace is versioned and kept separate from the app's internal routes, and the route-guard sweep asserts every route in it authenticates with a key and a scope.",
        keyFiles: [
          "lib/apiKeys/token.ts",
          "lib/apiKeys/store.ts",
          "lib/auth/requireApiKey.ts",
          "app/api/v1/leads/route.ts",
          "app/api/api-keys/route.ts",
          "components/settings/ApiKeysCard.tsx",
        ],
      },
      {
        id: "outbound-webhooks",
        name: "Outbound webhooks",
        status: "shipped",
        description: "A workspace subscribes its own service to four events, and Cadence posts to it when a reply arrives, an email bounces, someone unsubscribes, or a deal outcome changes. Signing uses the same timestamp-plus-body HMAC scheme the Stripe verifier already checks inbound, so a customer can reuse verification code they almost certainly already have, with a five-minute replay window because a signature over the body alone is replayable forever. The most dangerous input in the feature is the URL: an outbound webhook is a request the server makes to an address the customer picks, which is textbook server-side request forgery, and on Google Cloud the prize is the metadata endpoint whose response contains service-account tokens. So IP literals are refused in every notation, since blocking the dotted form while permitting the hex or integer spelling of the same address would be theatre; redirects are never followed, because following one would let a Location header aim the server anywhere and make the URL validation decorative; and the response body is never read, stored, or shown, since request forgery is only fully useful when the attacker can see what came back. Emission happens after the state it describes is committed, never before, so a receiver mirroring opt-outs is not told about one that then failed to record. Delivery runs in a Cloud Tasks worker rather than in the request that produced the event, so a slow endpoint cannot slow a reply sweep and a retry an hour later has somewhere durable to resume from. The exact signed bytes are stored with the delivery, because a retry has to present an identical body, and the delivery id is also the event id, so a receiver deduplicating on it sees one event across every retry. Retries distinguish a server error worth retrying from a rejected payload an identical retry cannot fix, with jitter that only ever spreads deliveries later so a recovering endpoint is not hammered; a 410 Gone turns the subscription off, and so do twenty consecutive failures. A test delivery is available and marked as a test in its payload, because otherwise the first delivery a customer ever receives is a real event they may lose to a verification bug. Admin-only throughout, and rate limited, since a subscription decides where a workspace's reply and deal data goes.",
        keyFiles: [
          "lib/webhooks/target.ts",
          "lib/webhooks/signature.ts",
          "lib/webhooks/retry.ts",
          "lib/webhooks/payload.ts",
          "lib/webhooks/store.ts",
          "lib/webhooks/emit.ts",
          "lib/webhooks/deliver.ts",
          "app/api/tasks/webhook-delivery/route.ts",
          "app/api/webhooks/route.ts",
          "components/settings/WebhooksCard.tsx",
          "schemas/integration.ts",
        ],
      },
      {
        id: "custom-tracking-domain",
        name: "Per-workspace tracking domain",
        status: "beta",
        description: "A workspace points a subdomain it controls at the deployment, verifies it with a CNAME, and its tracked links then carry that hostname instead of the one shared by every customer on the platform. Without it, one customer getting the shared hostname flagged puts a flagged domain in every other customer's mail. Only a verified domain is ever used, because an unverified one would put a hostname in real mail that does not resolve and break every link in the send, which is worse than the risk it was meant to avoid. A DNS lookup that cannot complete reports as still waiting rather than failed, since propagation takes minutes to hours and telling someone their correct record is broken sends them to change something already right. The apex is refused, because pointing a registrable domain at us would take over the customer's website, and the hostname a customer types is validated rather than cleaned up: its output is interpolated into a URL that goes into real email, so anything carrying an @, a colon, a slash, or a newline is rejected, and raw unicode is rejected in favour of punycode because two different-looking strings can normalise to the same host. Unsubscribe links deliberately stay on the platform hostname: an opt-out is legally required to keep working for as long as the mail exists, and a customer who later removed their CNAME would break every one already delivered. The Host a tracking request arrives on is cross-checked against the organisation its signed token names, so one customer's hostname cannot serve another's links, and that list is cached because the pixel and click endpoints are hit by mail clients rather than people. Marked beta until Cloud Run accepts customer hostnames through a wildcard mapping: verification succeeds before that exists, but the links will not resolve.",
        keyFiles: [
          "lib/tracking/domain.ts",
          "lib/tracking/verifyDomain.ts",
          "app/api/tracking-domain/route.ts",
          "components/deliverability/TrackingDomainCard.tsx",
          "firestore.indexes.json",
        ],
      },
      {
        id: "multi-inbox-rotation",
        name: "Multi-inbox rotation",
        status: "shipped",
        description: "Several Gmail accounts per user, with sends rotating across them. One warmed inbox tops out near 150 real sends a day, so that was the hard ceiling on what any customer could achieve. The existing single connection keeps its document id rather than being migrated, so an account that connected an inbox before this keeps its token, its history, and its warmup progress. Selection always picks the inbox that has sent least today, because filling one to its ceiling before touching the next produces exactly the spiky per-address pattern rotation exists to avoid; ties break toward the default inbox and then by id so the choice is reproducible from a bug report. A threaded follow-up is pinned to the inbox that started the thread and waits rather than switching, since a follow-up from another address is one the recipient sees as a stranger replying inside their conversation and Gmail will not thread it. A campaign may name its senders, and an unavailable chosen sender makes it wait rather than quietly using an address the customer excluded. Rotation is not a volume multiplier: the campaign limit and plan cap still bound the total, and reservation is two-level so the campaign counter enforces what the customer asked for while a per-inbox counter enforces what one mailbox may safely send. Warmup now requires lifetime volume as well as connection age, closing the case where an inbox connected weeks ago and never used read as fully warm, and the bounce brake moved to the inbox, which is the scope that always owned the reputation being spent. Each inbox can be labelled, paused, given its own lower daily limit, made the default, or removed, and reporting breaks volume and bounce rate down per address because a pooled rate hides which inbox is producing it.",
        keyFiles: [
          "lib/sending/inboxPool.ts",
          "lib/repositories/gmailConnections.ts",
          "app/api/gmail/inboxes/route.ts",
          "components/inboxes/InboxPoolCard.tsx",
          "components/campaign/SenderPicker.tsx",
          "app/api/tasks/send-message/route.ts",
        ],
      },
      {
        id: "spintax-variation",
        name: "Per-recipient message variation (spintax)",
        status: "shipped",
        description: "Alternatives written as {option one|option two}, including nested groups, resolved to one version per recipient. Five hundred byte-identical bodies is a fingerprint, providers cluster on message similarity, and varying the wording is one of the very few deliverability levers that costs nothing and needs no infrastructure. The template editor shows the live variant count, so a writer learns immediately whether the syntax took, and the spam scorer warns both when an email has no variation and when a group is malformed. It is a recursive parser rather than a regex, because a regex handles nesting by silently mangling it and corrupting an email is worse than refusing to send it. Double-brace placeholders are recognised and skipped whole, since the two syntaxes share a brace and a naive parser would strip one from every placeholder in the product. Expansion runs before placeholder substitution, so a lead whose company name genuinely contains braces is treated as data and can never become template syntax that decides what the email says. The choice is seeded from the recipient and the follow-up step rather than random, so a retry after an ambiguous delivery sends the byte-identical email instead of a second differently worded one, and the preview shows exactly what will go out.",
        keyFiles: [
          "lib/personalization/spintax.ts",
          "lib/personalization/preview.ts",
          "components/templates/VariationHint.tsx",
          "app/api/tasks/send-message/route.ts",
        ],
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
        description: "Reports can compare all current campaigns or isolate one current campaign, with 30-day, 90-day, and 12-month send cohorts. Decision-ready KPI cards, an initial-send funnel, trend, reply heatmap, best send hours, time to reply, tracked engagement caveats, campaign ranking, and CSV export share consistent performance math across Reports, Campaigns, and Home. Soft-deleted campaigns keep their own retained KPIs in Recently Deleted but no longer inflate workspace or rep totals.",
        keyFiles: ["lib/analytics/metrics.ts", "components/analytics/ReportFilters.tsx", "app/(dashboard)/reports", "app/(dashboard)/home", "app/(dashboard)/campaigns/[campaignId]"],
      },
      {
        id: "team-dashboards",
        name: "Team Lead dashboards + leaderboards",
        status: "shipped",
        description: "Roster management and per-member leaderboard KPIs (sent, replies, bounces, active campaigns) for managers and administrators. Admin-defined parent teams create a cycle-safe organization hierarchy; a parent-team manager receives explicit, tested visibility and roster control for descendant teams.",
        keyFiles: ["lib/teams/stats.ts", "lib/teams/access.ts", "lib/teams/hierarchy.ts", "components/team"],
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
        id: "audit-log",
        name: "Activity log",
        status: "shipped",
        description:
          "An append-only record, per workspace, of who changed what about the workspace itself. Campaign events already existed but they are campaign-scoped and describe sending; this describes administration, and it is the first thing a security review asks for and the thing that answers \"we did not do that\" when a customer disputes a change. Twenty-one actions across sending policy, access, mailboxes, credentials, data, and workspace identity, written at the sites that perform them: sending mode, AI writing, tracking domain, role changes, deactivation, invitations, Gmail connect and disconnect, API keys, webhooks, exports, deletion requests, session revocation, and renames. Two of those matter more than they look: a key and a webhook are standing access to the workspace's data from outside it, and unlike a member neither ever appears on the Team page, so without the log there is no surface that says one was ever issued. The action list is a closed enum rather than a free string, because an open one drifts into three spellings of the same event within a month and a log that cannot be filtered reliably is a log nobody reads. Actor email is snapshotted at write time rather than resolved at read time, since the entire point is to survive the thing it describes and a removed member leaves no document to resolve an id against. Details are restricted to scalars, so the log cannot accumulate into a second copy of the data deletion exists to destroy. Entries are written after the audited action succeeds and a failed write is reported rather than raised: the stricter discipline of refusing the action when it cannot be audited is right for a bank and wrong here, since a Firestore blip would then stop an admin turning off live sending. That trade is stated in the module. There is no update or delete anywhere, the read route is GET-only and admin-only, and a test asserts no route touches the collection directly; the only thing that removes entries is the workspace purge, because a record of a workspace we promised to destroy is still a record.",
        keyFiles: [
          "schemas/audit.ts",
          "lib/audit/log.ts",
          "lib/audit/actions.ts",
          "app/api/admin/audit/route.ts",
          "app/(dashboard)/admin/audit/page.tsx",
          "components/admin/AuditLogList.tsx",
        ],
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
        id: "first-run-activation",
        name: "First-run activation",
        status: "shipped",
        description: "Setup is five steps rather than seven, and two of the removed ones were never features: Your details and Sending defaults both rendered the same sender-profile form, once compact and once full, so the second asked a user to look again at a form they had just completed, and the test send sat as a gate between a new user and a working app. The test is now offered on the final step while the first-win checklist on Home asks again, so nobody is held up and nobody forgets. Three starter templates are seeded per user, two universal and one matched to the workflow the workspace step already asked about. Each carries the opt-out and physical-address placeholders that campaign launch requires, uses per-recipient variation so the first template anyone opens demonstrates the feature, and scores an A on the product own spam checker; all of those are asserted in tests, because a starter that fails the product own checks teaches a new user on day one that the product is broken. Each one also prompts the writer to replace its generic paragraph, so a scaffold is not mistaken for finished copy, and leaves the reader an easy way to decline, since complaints are the signal that actually costs a sending domain. Seeding is guarded both by a timestamp on the user, so deleted starters stay deleted, and by an empty-template check, so an established account is never handed templates it did not ask for.",
        keyFiles: [
          "lib/onboarding/starterTemplates.ts",
          "lib/onboarding/seed.ts",
          "components/OnboardingWizard.tsx",
          "lib/home/dashboard.ts",
        ],
      },
      {
        id: "command-palette",
        name: "Command palette (Cmd-K)",
        status: "shipped",
        description: "Cmd-K, or Ctrl-K, opens search over campaigns, leads, templates, and follow-ups, plus commands like New campaign and Import leads. Built on a plain dialog and listbox rather than a palette dependency, since the whole feature is a filtered list and a keydown handler. Ranking is explicit and tested because a palette lives or dies on its first result: exact match beats whole-string prefix beats word prefix beats substring, word boundaries include the separators that appear in real names, a match in secondary text never outranks one in the name, and multi-term queries match terms that are all present but not adjacent. Recency only breaks ties, so the three most recently touched campaigns cannot bury an exact name match on an older one. Actions and each entity type are capped separately, so one crowded group cannot push the others off the list. Commands carry search keywords, so the words people already have in their head (csv, upload, dkim, unsubscribe, gdpr, broken) find the right screen without anyone learning the product's vocabulary, and nothing gated by role or plan is ever offered. Campaigns, templates, and follow-ups are bounded collections and are ranked in memory for real substring matching; leads use Firestore prefix queries because a workspace holds tens of thousands, and that prefix-only limit is stated in the interface rather than left to be discovered. Arrow keys wrap and follow the drawn order across group headings, the highlight scrolls into view, a resting mouse cannot steal it from the keyboard, and every in-flight request is discarded when a newer one starts so a slow response cannot overwrite fresher results.",
        keyFiles: [
          "lib/search/rank.ts",
          "lib/search/actions.ts",
          "lib/search/workspace.ts",
          "app/api/search/route.ts",
          "components/palette/CommandPalette.tsx",
        ],
      },
      {
        id: "support-contact",
        name: "Support contact path",
        status: "shipped",
        description: "Two ways to reach a human, because they fail at different moments. Signed in, /help/contact takes a category, a subject, and what happened, and attaches the workspace, plan, subscription status, sending mode, Gmail connection status, and the running Cloud Run revision from the session, so the first reply can be an answer rather than a question about the customer's setup. Nothing from the mailbox, no lead data, and never the Gmail refresh token travels with it. Signed out or locked out, the public /support page carries a plain address, since someone who cannot authenticate cannot use an authenticated form and that is exactly when they most need help; the page renders per request and states plainly that no address is published yet rather than showing a mailto that goes nowhere. Requests are written to a server-only collection with a CDN-XXXXXX reference built on an alphabet without I, L, O, or U, so a reference read aloud or retyped stays the same reference, and are rate limited per user. An optional webhook pings a chat channel so a request is not waiting to be noticed.",
        keyFiles: [
          "lib/support/contact.ts",
          "lib/support/requests.ts",
          "app/api/support/route.ts",
          "app/(dashboard)/help/contact/page.tsx",
          "app/support/page.tsx",
          "components/support/ContactSupportForm.tsx",
        ],
      },
      {
        id: "account-deletion",
        name: "Account and workspace deletion",
        status: "shipped",
        description: "Self-service deletion in Settings, scheduled rather than immediate: a request starts a 30-day clock, the account keeps working throughout, and one click cancels it, because a grace period nobody can act during is only a delay. A one-person workspace collapses account and workspace scope into one operation, since deleting the only member while keeping the organization would leave an empty one behind. Deleting the last admin of a workspace that still has members is refused and says how to proceed instead, because the alternative is an organization with billing and campaigns that nobody can administer. The purge revokes the Google OAuth grant before destroying the encrypted token, since deleting our copy alone would leave the app sitting in the customer's Google account with mailbox access they believe they revoked, and it writes a tombstone before deleting anything so that the next sign-in cannot silently re-provision the account being deleted; once the purge completes, a genuinely new signup by the same person is allowed through with none of the old data. Scheduled requests are purged by a daily sweep, and a purge that fails partway is marked for a human rather than retried blindly.",
        keyFiles: [
          "lib/account/eligibility.ts",
          "lib/account/deletion.ts",
          "schemas/deletion.ts",
          "app/api/account/deletion/route.ts",
          "components/account/DeleteAccountCard.tsx",
          "lib/auth/requireUser.ts",
        ],
      },
      {
        id: "data-export",
        name: "Data export",
        status: "shipped",
        description: "Six CSV datasets and a settings snapshot from Settings: leads, campaigns, sending history, do-not-email, templates, and follow-ups. Each streams from a cursored Firestore read and is written a row at a time, so a workspace with a few hundred thousand recipient rows is never assembled in memory on the instance serving it, which is exactly the size of account that most needs an export to work. There is deliberately no staging bucket and no signed URL: a staged export would be a complete second copy of the personal data account deletion exists to destroy, requiring its own retention and its own purge path, and a fault in either would leave a customer's lead list in storage after they were told everything was gone. Exported values are guarded against spreadsheet formula injection, which quoting alone does not prevent, and are prefixed rather than stripped so a value like a negative number is never silently altered. Timestamps are ISO 8601 because an export is read by other software as often as by a person, and a failure mid-stream marks the file incomplete rather than ending in a truncated file that looks whole.",
        keyFiles: [
          "lib/export/serialize.ts",
          "lib/export/datasets.ts",
          "app/api/account/export/route.ts",
          "components/account/ExportDataCard.tsx",
        ],
      },
      {
        id: "waitlist-admin",
        name: "Sales-enquiry admin view",
        status: "shipped",
        description: "Admin view of public landing-page Talk to sales enquiries with CSV export.",
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
        description: "Conversion-focused, responsive public site for founders, focused sales teams, and agencies. Typography-first navigation, a calmer editorial layout, sharper outcome-led copy, restrained surfaces, and clearer section hierarchy make the offer feel more credible without sacrificing speed. A premium motion system makes the lead-to-reply workflow visible immediately through a stage clock, live action rail, coordinated product feedback, pointer-responsive lighting, and progressive section reveals without adding a motion dependency. User-controlled examples retain keyboard, touch, reduced-motion, browser-visibility, and off-screen pause behavior. The primary call to action is Get started and goes to sign-in, the secondary centers and focuses the contact field, and shared pricing, consent, tracking, safety, and deliverability limits remain explicit without unsupported performance claims.",
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
        name: "Sales-enquiry capture",
        status: "shipped",
        description: "Public, unauthenticated, rate-limited endpoint that records Talk to sales enquiries from the landing page.",
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
        name: "Legal and compliance center",
        status: "beta",
        description: "Public Terms, Privacy, Acceptable Use and Anti-Spam, and Compliance pages explain current product controls, customer duties, tracking limitations, opt-out handling, and the early-access posture. They are an implementation baseline, not final legal clearance: the operating entity, postal address, jurisdiction, retention schedule, subprocessor list, DPA, deletion/export workflow, and counsel approval remain required before self-service launch.",
        keyFiles: ["app/terms", "app/privacy", "app/acceptable-use", "app/compliance", "components/legal/LegalPage.tsx"],
      },
      {
        id: "generalized-onboarding",
        name: "Personalized workspace onboarding and guided tour",
        status: "shipped",
        description: "First-run setup captures workspace name, industry, team size, intended monthly outreach range, and primary workflow before Gmail connection, sender identity, conservative defaults, and a verified self-test. Answers tailor context but never increase plan, provider, or campaign limits. A keyboard-safe, reduced-motion-aware product tour uses polished workflow motion and can be replayed from Help.",
        keyFiles: ["components/OnboardingWizard.tsx", "app/api/onboarding/workspace", "components/tour/ProductTour.tsx", "lib/repositories/orgSettings.ts"],
      },
      {
        id: "multi-inbox-warmup",
        name: "Multi-inbox rotation + inbox warmup",
        status: "planned",
        description: "Scale sending volume safely across multiple connected inboxes with gradual warmup, a compete-tier feature for later.",
      },
      {
        id: "contact-enrichment",
        name: "Reviewable lead research and sourcing",
        status: "planned",
        description: "Future opt-in lead research and compliant sourcing with visible provenance, customer review, consent and acceptable-use controls, caching, strict cost limits, deletion support, and protections against fabricated personalization. Do not ship broad scraping or restricted-source collection without a separate legal, privacy, provider-terms, and abuse review.",
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
        description: "Toggle in the top bar, persisted to localStorage with a no-flash inline script honoring OS preference on first visit. Fixed a hydration error from server-timezone date formatting and a Reports chart-height bug. Every application surface, status, overlay, and filled-control foreground now uses semantic light/dark tokens, with measured contrast and no opacity-reduced body copy, replacing fragile palette-specific compatibility overrides.",
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
      {
        id: "cool-neutral-brand-system",
        name: "Cool neutral brand system",
        status: "shipped",
        description: "One cool, high-contrast neutral system across the product and the public site. Two accents carry two meanings: blue is clickable, green is finished or working, and money shares the green rather than adding a third hue. Light and dark themes have separate foreground-on-fill tokens and measured AA contrast pairs, surfaces separate from the page at 1.10:1 under a visible hairline, and elevation is gone in favour of rules and space. Regression coverage pins every ratio, bans direct palette utilities and retired identity colours, requires the landing stylesheet to be free of literal hex and non-neutral rgb(), and fails if any progress-bar fill ever shares its track token again.",
        keyFiles: ["app/globals.css", "components/marketing/landing.module.css", "components/templates/AiEmailWriter.tsx", "components/sequences/AiSequenceWriter.tsx", "components/home/PulseChart.tsx", "docs/brand.md", "tests/unit/brand-palette.test.ts"],
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

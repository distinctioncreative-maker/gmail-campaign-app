"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

interface Guide {
  id: string;
  icon: IconName;
  title: string;
  summary: string;
  steps: string[];
  cta?: { href: string; label: string };
}

interface GuideSection {
  heading: string;
  guides: Guide[];
}

const SECTIONS: GuideSection[] = [
  {
    heading: "Getting started",
    guides: [
      {
        id: "setup",
        icon: "settings",
        title: "Connect your Gmail",
        summary: "Send from your own account in under a minute.",
        steps: [
          "Go to Settings.",
          "Click 'Connect Gmail' and approve the Google screen.",
          "You'll see 'Connected' with your email: that's it.",
        ],
        cta: { href: "/settings", label: "Open Settings" },
      },
      {
        id: "leads",
        icon: "users",
        title: "Import leads",
        summary: "Paste from Salesforce or upload a CSV.",
        steps: [
          "Go to Leads and pick 'Paste leads' or 'Upload CSV'.",
          "Paste your Salesforce rows (or drop a CSV file) and click Preview.",
          "Check the badges: Ready, Opted out, Used before: untick anyone you don't want.",
          "Click 'Continue with selected leads' to import.",
        ],
        cta: { href: "/leads", label: "Import leads" },
      },
      {
        id: "lead-lists",
        icon: "users",
        title: "Organize leads into lists",
        summary: "Named, ever-growing groups you can reuse in campaigns.",
        steps: [
          "On Leads, use 'Lead lists' to create a list like “Alpine: restaurants” or “Everest past clients”.",
          "Import or add leads straight into a list: duplicates are merged automatically, so a list only ever grows.",
          "When you build a campaign, pick 'Start from a lead list' on the Leads step to load that whole group.",
          "Lists are yours alone; deleting a list never deletes the leads in it.",
        ],
        cta: { href: "/leads", label: "Open Leads" },
      },
      {
        id: "template",
        icon: "mail",
        title: "Write a template",
        summary: "A reusable email that personalizes itself.",
        steps: [
          "Go to Templates → New template.",
          "Start from a layout, paste HTML, or import a Gmail draft.",
          "Use the 'Insert placeholder' menu to add things like {{first_name}} and {{signature}}.",
          "Click 'Send me a test' to see exactly what recipients will get.",
        ],
        cta: { href: "/templates/new", label: "Create a template" },
      },
      {
        id: "ai-writer",
        icon: "sparkles",
        title: "Write emails with AI",
        summary: "Describe it in a sentence: get a ready-to-edit draft.",
        steps: [
          "In the template editor, click 'Write this email with AI'.",
          "Describe the email, or tap an occasion like 'New Year, New You' or 'Mid-month check-in'.",
          "Managers/admins can set 'Brand memory' once (your offer, benefits, tone): the AI weaves it into every draft in a fresh way, so Alpine and Everest emails always stay on-brand.",
          "Click 'Write it', then edit to taste and send yourself a test.",
        ],
        cta: { href: "/templates/new", label: "Try the AI writer" },
      },
      {
        id: "signature",
        icon: "edit",
        title: "Use your own signature",
        summary: "Paste your existing signature instead of retyping it.",
        steps: [
          "Go to Settings → 'Your email signature'.",
          "Paste your signature (plain text or HTML copied from Gmail).",
          "In your template, insert the {{signature}} placeholder where it should appear.",
        ],
        cta: { href: "/settings", label: "Add your signature" },
      },
    ],
  },
  {
    heading: "Sending & follow-ups",
    guides: [
      {
        id: "campaign",
        icon: "rocket",
        title: "Create a campaign",
        summary: "The guided wizard from leads to launch.",
        steps: [
          "Go to Campaigns → Create campaign.",
          "Name it, pick your leads, and review who's included.",
          "Choose your email template and (optionally) a follow-up sequence.",
          "Pick a pace: Conservative, Balanced, or Faster: then Start.",
          "While in test mode, every email safely goes to your test address.",
        ],
        cta: { href: "/campaigns/new", label: "Create a campaign" },
      },
      {
        id: "followups",
        icon: "repeat",
        title: "Set up follow-ups",
        summary: "Automatic nudges that stop on reply.",
        steps: [
          "Go to Follow-Ups → New sequence.",
          "Add steps with a wait time and an email for each.",
          "Follow-ups stop automatically when someone replies, unsubscribes, or bounces.",
          "Pick the sequence in the campaign wizard's schedule step.",
        ],
        cta: { href: "/sequences/new", label: "Build a sequence" },
      },
      {
        id: "tracking",
        icon: "chart",
        title: "Turn on open & click tracking",
        summary: "Optional, off by default, per campaign.",
        steps: [
          "In the campaign wizard's Schedule step, check 'Track opens and clicks (optional)'.",
          "It's off by default because a tracking pixel and rewritten links are a known deliverability signal: only turn it on when you specifically need the numbers.",
          "Rates show up on Reports once at least one tracked campaign has sent, and as raw counts on that campaign's detail page.",
          "Cadence creates one notification for the first detected open per recipient. Email apps can preload images, so treat it as a signal rather than proof of a human read.",
        ],
        cta: { href: "/reports", label: "Open Reports" },
      },
    ],
  },
  {
    heading: "Replies & reporting",
    guides: [
      {
        id: "replies",
        icon: "reply",
        title: "Work your replies",
        summary: "Every reply across all campaigns, in one inbox.",
        steps: [
          "Open Replies in the sidebar: newest replies first.",
          "Click a reply to read the full thread right there, or 'Open in Gmail' to continue in the actual thread.",
          "Click the lead's name to see their full history and add notes.",
          "Expecting a reply that isn't showing? Hit 'Scan for replies': it also syncs every lead's stats.",
        ],
        cta: { href: "/replies", label: "Open Replies" },
      },
      {
        id: "reports",
        icon: "chart",
        title: "Read your reports",
        summary: "Filter one campaign or compare performance across all outreach.",
        steps: [
          "Open Reports and choose one campaign or leave the filter on All campaigns.",
          "Use the analysis period to study 30, 90, or 365 days of send timing and reply behavior.",
          "Read the all-time KPI cards and funnel separately from the selected timing cohort.",
          "Numbers look low? Click 'Scan for replies' to pull the latest before reading them.",
          "Export a CSV any time to share or dig deeper in a spreadsheet.",
        ],
        cta: { href: "/reports", label: "Open Reports" },
      },
    ],
  },
  {
    heading: "Leads & deliverability",
    guides: [
      {
        id: "edit-lead",
        icon: "edit",
        title: "Edit a lead & keep notes",
        summary: "Fix details, add context, mark Do Not Email.",
        steps: [
          "Open Leads and click any lead's name.",
          "Click 'Edit lead' to fix their name, business, phone, or amount: templates pick up the new values on future sends.",
          "Add private notes (call outcomes, context, next steps).",
          "Use 'Do Not Email' to exclude them from all future campaigns, or Delete to remove them entirely.",
        ],
        cta: { href: "/leads", label: "Open Leads" },
      },
      {
        id: "deliverability",
        icon: "shield",
        title: "Protect your deliverability",
        summary: "Land in inboxes, not spam.",
        steps: [
          "Open Deliverability for a zero-setup check of your domain's SPF, DKIM, and DMARC.",
          "Connect Google Postmaster Tools (optional) to see Gmail's own spam-rate and reputation data.",
          "Warm up slowly: the Conservative pace is safest for a new sending address.",
          "Fix any red items before running large campaigns.",
        ],
        cta: { href: "/deliverability", label: "Open Deliverability" },
      },
      {
        id: "do-not-email",
        icon: "ban",
        title: "Keep a Do Not Email list",
        summary: "Suppress anyone who should never be contacted.",
        steps: [
          "Open 'Do Not Email' to see everyone who's suppressed or unsubscribed.",
          "Add emails or whole domains by hand, or paste a list.",
          "Unsubscribes and hard bounces are added automatically: you never email them again.",
          "Suppression always wins: a suppressed address is skipped even if it's selected in a campaign.",
        ],
        cta: { href: "/suppressions", label: "Open Do Not Email" },
      },
    ],
  },
  {
    heading: "Team & admin",
    guides: [
      {
        id: "teams",
        icon: "team",
        title: "Teams for leads & admins",
        summary: "Track your team and move reps around.",
        steps: [
          "Admins: on the Team page, create teams and pick each Team Lead (they need the Team Lead role, set in Administration).",
          "Team Leads: see your team's reply-rate leaderboard, and add or remove reps with 'Add a rep…'.",
          "Click 'View' on any rep to drill into their campaigns: read-only, for coaching.",
          "Reps always keep their own private workspace; nothing they own moves when teams change.",
        ],
        cta: { href: "/team", label: "Open Team" },
      },
      {
        id: "admin",
        icon: "admin",
        title: "Administration & health (admins)",
        summary: "Sending mode, org settings, and live status checks.",
        steps: [
          "Administration is where an admin flips the org between Test and Live sending: the banner up top always shows which is active.",
          "Set org-wide rules there: send-confirmation thresholds and team-collision policy.",
          "System Health shows Gmail connection, queue, and integration status at a glance.",
          "Only admins see these pages; everyone else stays focused on sending.",
        ],
        cta: { href: "/admin", label: "Open Administration" },
      },
    ],
  },
];

function matches(guide: Guide, query: string): boolean {
  if (!query) return true;
  const haystack = [guide.title, guide.summary, ...guide.steps].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function HelpGuides({ query = "" }: { query?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const sections = SECTIONS.map((section) => ({
    heading: section.heading,
    guides: section.guides.filter((g) => matches(g, q)),
  })).filter((section) => section.guides.length > 0);
  const resultCount = sections.reduce(
    (count, section) => count + section.guides.length,
    0
  );

  if (q && sections.length === 0) {
    return <p className="text-sm text-muted">No guides match &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div className="space-y-6">
      {q ? (
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {resultCount} guide{resultCount === 1 ? "" : "s"} found
        </p>
      ) : null}
      {sections.map((section) => (
        <div key={section.heading}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{section.heading}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.guides.map((g) => (
              <div key={g.id} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                  className="flex w-full items-start gap-3 p-5 text-left hover:bg-surface-2"
                  aria-expanded={open === g.id}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground">
                    <Icon name={g.icon} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{g.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{g.summary}</span>
                  </span>
                  <span
                    className={`mt-1 text-muted transition-transform ${
                      open === g.id ? "rotate-180" : ""
                    }`}
                  >
                    <Icon name="chevronDown" size={16} />
                  </span>
                </button>
                {open === g.id && (
                  <div className="border-t border-border bg-surface-2/60 px-5 py-4">
                    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                      {g.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    {g.cta && (
                      <Link
                        href={g.cta.href}
                        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        {g.cta.label}
                        <Icon name="chevronRight" size={14} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

interface Guide {
  id: string;
  icon: string;
  title: string;
  summary: string;
  steps: string[];
  cta?: { href: string; label: string };
}

const GUIDES: Guide[] = [
  {
    id: "setup",
    icon: "🔌",
    title: "Connect your Gmail",
    summary: "Send from your own account in under a minute.",
    steps: [
      "Go to Settings.",
      "Click 'Connect Gmail' and approve the Google screen.",
      "You'll see 'Connected' with your email — that's it.",
    ],
    cta: { href: "/settings", label: "Open Settings" },
  },
  {
    id: "leads",
    icon: "👥",
    title: "Import leads",
    summary: "Paste from Salesforce or upload a CSV.",
    steps: [
      "Go to Leads and pick 'Paste leads' or 'Upload CSV'.",
      "Paste your Salesforce rows (or drop a CSV file) and click Preview.",
      "Check the badges — Ready, Opted out, Used before — untick anyone you don't want.",
      "Click 'Continue with selected leads' to import.",
    ],
    cta: { href: "/leads", label: "Import leads" },
  },
  {
    id: "template",
    icon: "✉️",
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
    id: "signature",
    icon: "🖋️",
    title: "Use your own signature",
    summary: "Paste your existing signature instead of retyping it.",
    steps: [
      "Go to Settings → 'Your email signature'.",
      "Paste your signature (plain text or HTML copied from Gmail).",
      "In your template, insert the {{signature}} placeholder where it should appear.",
    ],
    cta: { href: "/settings", label: "Add your signature" },
  },
  {
    id: "campaign",
    icon: "🚀",
    title: "Create a campaign",
    summary: "The guided wizard from leads to launch.",
    steps: [
      "Go to Campaigns → Create campaign.",
      "Name it, pick your leads, and review who's included.",
      "Choose your email template and (optionally) a follow-up sequence.",
      "Pick a pace — Conservative, Balanced, or Faster — then Start.",
      "While in test mode, every email safely goes to your test address.",
    ],
    cta: { href: "/campaigns/new", label: "Create a campaign" },
  },
  {
    id: "followups",
    icon: "🔁",
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
    id: "replies",
    icon: "🎉",
    title: "Work your replies",
    summary: "Every reply across all campaigns, in one inbox.",
    steps: [
      "Open Replies in the sidebar — newest replies first.",
      "Click 'Open in Gmail' to continue the conversation in the actual thread.",
      "Click the lead's name to see their full history and add notes.",
      "Expecting a reply that isn't showing? Hit 'Scan for replies' — it also syncs every lead's stats.",
    ],
    cta: { href: "/replies", label: "Open Replies" },
  },
  {
    id: "edit-lead",
    icon: "✏️",
    title: "Edit a lead & keep notes",
    summary: "Fix details, add context, mark Do Not Email.",
    steps: [
      "Open Leads and click any lead's name.",
      "Click 'Edit lead' to fix their name, business, phone, or amount — templates pick up the new values on future sends.",
      "Add private notes (call outcomes, context, next steps).",
      "Use 'Do Not Email' to exclude them from all future campaigns, or Delete to remove them entirely.",
    ],
    cta: { href: "/leads", label: "Open Leads" },
  },
  {
    id: "teams",
    icon: "🧭",
    title: "Teams for leads & admins",
    summary: "Track your team and move reps around.",
    steps: [
      "Admins: on the Team page, create teams and pick each Team Lead (they need the Team Lead role, set in Administration).",
      "Team Leads: see your team's reply-rate leaderboard, and add or remove reps with 'Add a rep…'.",
      "Click 'View' on any rep to drill into their campaigns — read-only, for coaching.",
      "Reps always keep their own private workspace; nothing they own moves when teams change.",
    ],
    cta: { href: "/team", label: "Open Team" },
  },
];

export function HelpGuides() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {GUIDES.map((g) => (
        <div key={g.id} className="card p-5">
          <button
            onClick={() => setOpen(open === g.id ? null : g.id)}
            className="flex w-full items-start gap-3 text-left"
            aria-expanded={open === g.id}
          >
            <span aria-hidden className="text-2xl">{g.icon}</span>
            <span>
              <span className="block font-medium">{g.title}</span>
              <span className="mt-0.5 block text-sm text-slate-500">{g.summary}</span>
            </span>
          </button>
          {open === g.id && (
            <div className="mt-3 border-t border-border pt-3">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                {g.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {g.cta && (
                <Link
                  href={g.cta.href}
                  className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                >
                  {g.cta.label} →
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

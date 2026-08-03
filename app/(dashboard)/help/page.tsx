"use client";

import { useState } from "react";
import Link from "next/link";
import { TestCenter } from "@/components/TestCenter";
import { ReplayTourButton } from "@/components/tour/ReplayTourButton";
import { HelpGuides } from "@/components/help/HelpGuides";
import { Faq } from "@/components/help/Faq";
import { FeatureSuggestions } from "@/components/help/FeatureSuggestions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";

const QUICK_PATHS: Array<{
  href: string;
  icon: IconName;
  title: string;
  description: string;
}> = [
  {
    href: "/leads",
    icon: "users",
    title: "Bring in leads",
    description: "Paste a list, upload CSV, and review safety classifications.",
  },
  {
    href: "/templates/new",
    icon: "sparkles",
    title: "Write with AI",
    description: "Create an on-brand email, preview it, and send yourself a test.",
  },
  {
    href: "/campaigns/new",
    icon: "rocket",
    title: "Build a campaign",
    description: "Choose leads, templates, pacing, and complete the safety review.",
  },
  {
    href: "/reports",
    icon: "chart",
    title: "Understand results",
    description: "Filter campaign reports and compare replies, bounces, and timing.",
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");

  return (
    <div>
      <PageHeader
        title="Help & Test Center"
        description="Task-based guidance, safe system checks, and plain-language troubleshooting for every part of Cadence."
        actions={<ReplayTourButton />}
      />

      <div className="card overflow-hidden">
        <div className="border-b border-border bg-surface-2 p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground">
            Knowledge center
          </p>
          <h2 className="mt-1 text-xl font-semibold">What can we help you accomplish?</h2>
          <div className="relative mt-4 max-w-2xl">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campaigns, leads, Gmail, tracking, reports..."
              className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        {!query ? (
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_PATHS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-3 bg-surface p-5 hover:bg-surface-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>
                  <span className="flex items-center gap-1 text-sm font-semibold group-hover:text-foreground">
                    {item.title}
                    <Icon name="chevronRight" size={14} />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {item.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* Guided how-tos */}
      <div id="guides" className="mt-8 scroll-mt-24">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">How-to guides</h2>
            <p className="mt-1 text-xs text-muted">
              Follow a short, practical path through common Cadence tasks.
            </p>
          </div>
          {!query ? (
            <a href="#questions" className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              Jump to troubleshooting
            </a>
          ) : null}
        </div>
        <HelpGuides query={query} />
      </div>

      {/* Test Center: not searched, always fully visible: it's a short,
          fixed checklist rather than a lookup surface. */}
      {!query && (
        <div id="test-center" className="mt-10 scroll-mt-24">
          <h2 className="mb-1 font-medium">Test Center</h2>
          <p className="mb-3 text-sm text-muted">
            Run these any time to confirm core workflows. Test emails go only to your configured test
            address.
          </p>
          <TestCenter />
        </div>
      )}

      {/* FAQ */}
      <div id="questions" className="mt-10 scroll-mt-24">
        <h2 className="font-semibold">Common questions &amp; troubleshooting</h2>
        <p className="mb-3 mt-1 text-xs text-muted">
          Clear explanations for sending, safety, deliverability, and access.
        </p>
        <Faq query={query} />
      </div>

      {!query ? (
        <div className="mt-10 card p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground">
            Trust and responsible use
          </p>
          <h2 className="mt-1 font-semibold">Compliance and pilot policies</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Review how Cadence handles commercial email footers, opt-outs, tracking,
            privacy, and acceptable use before launching a campaign.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["/compliance", "Email compliance"],
              ["/acceptable-use", "Acceptable use"],
              ["/privacy", "Privacy notice"],
              ["/terms", "Pilot terms"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="btn-secondary min-h-11 px-4 py-2.5 text-sm">
                {label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Feature suggestions */}
      {!query && (
        <div className="mt-10">
          <h2 className="mb-1 font-medium">Suggest a feature</h2>
          <p className="mb-3 text-sm text-muted">
            Tell us what would make Cadence better. Ideas are shared with your team.
          </p>
          <FeatureSuggestions />
        </div>
      )}
    </div>
  );
}

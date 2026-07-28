"use client";

import { useState } from "react";
import { TestCenter } from "@/components/TestCenter";
import { ReplayTourButton } from "@/components/tour/ReplayTourButton";
import { HelpGuides } from "@/components/help/HelpGuides";
import { Faq } from "@/components/help/Faq";
import { FeatureSuggestions } from "@/components/help/FeatureSuggestions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

export default function HelpPage() {
  const [query, setQuery] = useState("");

  return (
    <div>
      <PageHeader
        title="Help & Test Center"
        description="Guides, safe self-checks, troubleshooting answers, and a replayable tour — everything you need to feel confident."
        actions={<ReplayTourButton />}
      />

      {/* Search */}
      <div className="relative mt-6 max-w-md">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted/70">
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides and questions…"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Guided how-tos */}
      <div className="mt-8">
        <h2 className="mb-3 font-medium">How-to guides</h2>
        <HelpGuides query={query} />
      </div>

      {/* Test Center — not searched, always fully visible: it's a short,
          fixed checklist rather than a lookup surface. */}
      {!query && (
        <div className="mt-10">
          <h2 className="mb-1 font-medium">Test Center</h2>
          <p className="mb-3 text-sm text-muted">
            Run these any time to confirm everything works. Completely safe — test emails only go to
            you.
          </p>
          <TestCenter />
        </div>
      )}

      {/* FAQ */}
      <div className="mt-10">
        <h2 className="mb-3 font-medium">Common questions &amp; troubleshooting</h2>
        <Faq query={query} />
      </div>

      {/* Feature suggestions */}
      {!query && (
        <div className="mt-10">
          <h2 className="mb-1 font-medium">Suggest a feature</h2>
          <p className="mb-3 text-sm text-muted">
            Tell us what would make Cadence better — ideas are shared with your team.
          </p>
          <FeatureSuggestions />
        </div>
      )}
    </div>
  );
}

import { TestCenter } from "@/components/TestCenter";
import { ReplayTourButton } from "@/components/tour/ReplayTourButton";
import { HelpGuides } from "@/components/help/HelpGuides";
import { Faq } from "@/components/help/Faq";
import { PageHeader } from "@/components/ui/PageHeader";

export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="Help & Test Center"
        description="Guides, safe self-checks, troubleshooting answers, and a replayable tour — everything you need to feel confident."
        actions={<ReplayTourButton />}
      />

      {/* Guided how-tos */}
      <div className="mt-8">
        <h2 className="mb-3 font-medium">How-to guides</h2>
        <HelpGuides />
      </div>

      {/* Test Center */}
      <div className="mt-10">
        <h2 className="mb-1 font-medium">Test Center</h2>
        <p className="mb-3 text-sm text-slate-500">
          Run these any time to confirm everything works. Completely safe — test emails only go to
          you.
        </p>
        <TestCenter />
      </div>

      {/* FAQ */}
      <div className="mt-10">
        <h2 className="mb-3 font-medium">Common questions &amp; troubleshooting</h2>
        <Faq />
      </div>
    </div>
  );
}

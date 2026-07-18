import { TestCenter } from "@/components/TestCenter";
import { ReplayTourButton } from "@/components/tour/ReplayTourButton";
import { HelpGuides } from "@/components/help/HelpGuides";

export default function HelpPage() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help &amp; Test Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Guides, safe self-checks, and a replayable tour — everything you need to feel confident.
          </p>
        </div>
        <ReplayTourButton />
      </div>

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
        <h2 className="mb-3 font-medium">Common questions</h2>
        <div className="card divide-y divide-border">
          {[
            ["Where do my emails send from?", "Your own connected Gmail account. Replies land in your normal inbox."],
            ["Are my leads private?", "Yes. Your leads, templates, and campaigns are visible only to you."],
            ["What happens when someone replies?", "Any pending follow-ups to that person stop automatically."],
            ["What is test mode?", "A safe mode where every email goes only to your test address with [TEST] in the subject — so you can practice without emailing real people. An admin turns on real sending when the team is ready."],
            ["How do I stop a campaign?", "Open the campaign and use Pause (temporary) or Stop (permanent). You can also cancel unsent emails and delete their drafts."],
            ["Someone asked to unsubscribe — what now?", "It's handled automatically: they're added to your Do Not Email list and won't be contacted again. You can also add people there manually."],
          ].map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none font-medium text-slate-800 marker:content-none">
                <span className="mr-2 text-slate-400 group-open:hidden">＋</span>
                <span className="mr-2 hidden text-slate-400 group-open:inline">－</span>
                {q}
              </summary>
              <p className="mt-2 pl-6 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

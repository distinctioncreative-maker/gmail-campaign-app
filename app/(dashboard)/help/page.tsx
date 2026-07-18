import { TestCenter } from "@/components/TestCenter";

export default function HelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Help &amp; Test Center</h1>
      <p className="mt-1 text-sm text-slate-600">
        Run these checks any time to make sure everything is working. They&apos;re completely
        safe — test emails only ever go to you.
      </p>
      <div className="mt-6">
        <TestCenter />
      </div>

      <div className="mt-10 max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-medium">Quick answers</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Where do my emails send from?</dt>
            <dd className="text-slate-600">Your own connected Gmail account.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">What happens when someone replies?</dt>
            <dd className="text-slate-600">Follow-ups to that person stop automatically.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Can other people see my leads?</dt>
            <dd className="text-slate-600">No. Your leads and campaigns are private to you.</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

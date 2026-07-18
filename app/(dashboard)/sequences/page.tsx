import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listSequences } from "@/lib/repositories/sequences";

const UNIT_LABEL: Record<string, string> = {
  MINUTES: "min",
  HOURS: "hr",
  DAYS: "days",
  BUSINESS_DAYS: "business days",
};

export default async function SequencesPage() {
  const ctx = await requireUser();
  const sequences = await listSequences(ctx);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Follow-up sequences</h1>
          <p className="mt-1 text-sm text-slate-600">
            Automatic follow-ups that stop the moment someone replies.
          </p>
        </div>
        <Link
          href="/sequences/new"
          className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
        >
          New sequence
        </Link>
      </div>

      {sequences.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-slate-600">No sequences yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Build a timeline of follow-ups once, then reuse it in any campaign.
          </p>
          <Link
            href="/sequences/new"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          >
            Create your first sequence
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sequences.map((s) => (
            <Link
              key={s.sequenceId}
              href={`/sequences/${s.sequenceId}`}
              className="rounded-2xl bg-white p-5 shadow-sm hover:shadow-md"
            >
              <p className="font-medium">{s.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {s.steps.length} follow-up{s.steps.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {s.steps.slice(0, 3).map((step, i) => (
                  <li key={i}>
                    ↓ wait {step.delayValue} {UNIT_LABEL[step.delayUnit]} → follow-up {i + 1}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

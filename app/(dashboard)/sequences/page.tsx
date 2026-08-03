import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listSequences } from "@/lib/repositories/sequences";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

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
      <PageHeader
        title="Follow-up sequences"
        description="Automatic follow-ups that stop the moment someone replies."
        actions={
          <Link href="/sequences/new" className="btn-primary px-5 py-2.5 text-sm">
            New sequence
          </Link>
        }
      />

      {sequences.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Most replies come from the follow-up"
          description="Build a timeline of follow-ups once, then reuse it in any campaign. Anyone who replies is dropped from the sequence automatically."
          action={{ href: "/sequences/new", label: "Create your first sequence" }}
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sequences.map((s, i) => (
            <Link
              key={s.sequenceId}
              href={`/sequences/${s.sequenceId}`}
              className="card card-hover animate-rise p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
            >
              <p className="font-medium">{s.name}</p>
              <p className="mt-1 text-sm text-muted">
                {s.steps.length} follow-up{s.steps.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
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

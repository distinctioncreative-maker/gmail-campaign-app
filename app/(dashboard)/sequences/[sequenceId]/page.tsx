import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getSequence } from "@/lib/repositories/sequences";
import { listTemplates } from "@/lib/repositories/templates";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";
import { LocalTime } from "@/components/LocalTime";
import { EntityHeader } from "@/components/ui/EntityHeader";

export default async function EditSequencePage({
  params,
}: {
  params: Promise<{ sequenceId: string }>;
}) {
  const ctx = await requireUser();
  const { sequenceId } = await params;
  const [sequence, templates] = await Promise.all([getSequence(ctx, sequenceId), listTemplates(ctx)]);
  if (!sequence) notFound();

  return (
    <div>
      <EntityHeader
        kicker="Follow-up sequence"
        title={sequence.name}
        description="Steps, timing, and stop rules."
        backHref="/sequences"
        backLabel="All follow-ups"
        meta={[
          {
            label: "Steps",
            value: (
              <span className="tabular-nums">
                {sequence.steps.length} {sequence.steps.length === 1 ? "step" : "steps"}
              </span>
            ),
          },
          {
            label: "Last edited",
            value: <LocalTime value={sequence.updatedAt} options={{ dateStyle: "medium" }} />,
          },
        ]}
      />
      <div>
        <SequenceBuilder
          sequenceId={sequence.sequenceId}
          initial={{
            name: sequence.name,
            description: sequence.description,
            outOfOfficePolicy: sequence.outOfOfficePolicy,
            stopOnReply: sequence.stopOnReply,
            stopOnBounce: sequence.stopOnBounce,
            stopOnUnsubscribe: sequence.stopOnUnsubscribe,
            steps: sequence.steps.map((s) => ({
              delayValue: s.delayValue,
              delayUnit: s.delayUnit,
              bodyMode: s.bodyMode,
              templateId: s.templateId,
              customHtml: s.customHtml,
              subjectMode: s.subjectMode,
              customSubject: s.customSubject,
              sameThread: s.sameThread,
              enabled: s.enabled,
            })),
          }}
          templates={templates.map((t) => ({ templateId: t.templateId, name: t.name }))}
        />
      </div>
    </div>
  );
}

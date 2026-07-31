import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getSequence } from "@/lib/repositories/sequences";
import { listTemplates } from "@/lib/repositories/templates";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        title={sequence.name}
        description="Edit the follow-up steps, timing, and stop rules for this sequence."
        backHref="/sequences"
        backLabel="All follow-ups"
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getSequence } from "@/lib/repositories/sequences";
import { listTemplates } from "@/lib/repositories/templates";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";

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
      <Link href="/sequences" className="text-sm text-slate-500 hover:underline">
        ← All sequences
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit sequence</h1>
      <div className="mt-6">
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

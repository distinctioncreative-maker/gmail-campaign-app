import { requireUser } from "@/lib/auth/requireUser";
import { listTemplates } from "@/lib/repositories/templates";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewSequencePage() {
  const ctx = await requireUser();
  const templates = await listTemplates(ctx);
  return (
    <div>
      <PageHeader
        title="New follow-up sequence"
        description="Set what goes out next, and when to stop once someone replies."
        backHref="/sequences"
        backLabel="All follow-ups"
      />
      <SequenceBuilder
        sequenceId={null}
        initial={null}
        templates={templates.map((t) => ({ templateId: t.templateId, name: t.name }))}
      />
    </div>
  );
}

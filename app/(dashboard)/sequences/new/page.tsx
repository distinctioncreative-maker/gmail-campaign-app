import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listTemplates } from "@/lib/repositories/templates";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";

export default async function NewSequencePage() {
  const ctx = await requireUser();
  const templates = await listTemplates(ctx);
  return (
    <div>
      <Link href="/sequences" className="text-sm text-slate-500 hover:underline">
        ← All sequences
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New sequence</h1>
      <div className="mt-6">
        <SequenceBuilder
          sequenceId={null}
          initial={null}
          templates={templates.map((t) => ({ templateId: t.templateId, name: t.name }))}
        />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getTemplate } from "@/lib/repositories/templates";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const ctx = await requireUser();
  const { templateId } = await params;
  const template = await getTemplate(ctx, templateId);
  if (!template) notFound();

  return (
    <div>
      <Link href="/templates" className="text-sm text-slate-500 hover:underline">
        ← All templates
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit template</h1>
      <div className="mt-6">
        <TemplateEditor
          templateId={template.templateId}
          initial={{
            name: template.name,
            subjectTemplate: template.subjectTemplate,
            htmlTemplate: template.htmlTemplate,
            type: template.type,
          }}
        />
      </div>
    </div>
  );
}

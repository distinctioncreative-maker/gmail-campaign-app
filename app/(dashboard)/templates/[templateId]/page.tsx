import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getTemplate } from "@/lib/repositories/templates";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        title={template.name}
        description="Edit this template. Changes apply to campaigns that use it from now on."
        backHref="/templates"
        backLabel="All templates"
      />
      <div>
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

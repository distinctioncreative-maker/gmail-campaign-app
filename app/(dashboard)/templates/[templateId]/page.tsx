import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { getTemplate } from "@/lib/repositories/templates";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { LocalTime } from "@/components/LocalTime";
import { EntityHeader } from "@/components/ui/EntityHeader";

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
      <EntityHeader
        kicker="Template"
        title={template.name}
        description="Changes apply to campaigns that use it from now on."
        backHref="/templates"
        backLabel="All templates"
        meta={[
          // No "Type" row. template.type is the authoring source (VISUAL,
          // PASTED_HTML, GMAIL_DRAFT), which describes how the template was
          // built rather than anything the reader needs, and there is no label
          // map for it because it has never been shown to a user. A field
          // existing is not a reason to put it in a header.
          {
            label: "Last edited",
            value: <LocalTime value={template.updatedAt} options={{ dateStyle: "medium" }} />,
          },
          {
            label: "Created",
            value: <LocalTime value={template.createdAt} options={{ dateStyle: "medium" }} />,
          },
        ]}
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

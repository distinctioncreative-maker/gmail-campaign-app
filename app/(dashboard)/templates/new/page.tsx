import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NewTemplatePage() {
  return (
    <div>
      <PageHeader
        title="New template"
        description="Write the email once, then reuse it across campaigns."
        backHref="/templates"
        backLabel="All templates"
      />
      <TemplateEditor templateId={null} initial={null} />
    </div>
  );
}

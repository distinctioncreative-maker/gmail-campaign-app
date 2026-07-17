import Link from "next/link";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default function NewTemplatePage() {
  return (
    <div>
      <Link href="/templates" className="text-sm text-slate-500 hover:underline">
        ← All templates
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New template</h1>
      <div className="mt-6">
        <TemplateEditor templateId={null} initial={null} />
      </div>
    </div>
  );
}

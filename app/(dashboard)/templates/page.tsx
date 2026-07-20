import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listTemplates } from "@/lib/repositories/templates";
import { TemplateListActions } from "@/components/templates/TemplateListActions";
import { LocalTime } from "@/components/LocalTime";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function TemplatesPage() {
  const ctx = await requireUser();
  const templates = await listTemplates(ctx, { includeArchived: true });
  const active = templates.filter((t) => t.active);
  const archived = templates.filter((t) => !t.active);

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Reusable emails with placeholders that fill in each lead's details."
        actions={
          <Link href="/templates/new" className="btn-primary px-5 py-2.5 text-sm">
            New template
          </Link>
        }
      />

      {active.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-600">No templates yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Start from a ready-made layout, paste your own HTML, or import a Gmail draft.
          </p>
          <Link
            href="/templates/new"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((t) => (
            <div key={t.templateId} className="flex flex-col card p-5">
              <Link href={`/templates/${t.templateId}`} className="font-medium hover:underline">
                {t.name}
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.subjectTemplate}</p>
              <p className="mt-2 text-xs text-slate-400">
                v{t.version} · updated{" "}
                <LocalTime value={t.updatedAt} options={{ dateStyle: "medium" }} />
              </p>
              <div className="mt-auto pt-3">
                <TemplateListActions templateId={t.templateId} archived={false} />
              </div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-slate-500">
            Archived templates ({archived.length})
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((t) => (
              <div key={t.templateId} className="rounded-2xl bg-white p-5 opacity-70 shadow-sm">
                <p className="font-medium">{t.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.subjectTemplate}</p>
                <div className="mt-3">
                  <TemplateListActions templateId={t.templateId} archived={true} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

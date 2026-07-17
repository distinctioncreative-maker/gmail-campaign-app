import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { listTemplates } from "@/lib/repositories/templates";
import { TemplateListActions } from "@/components/templates/TemplateListActions";

export default async function TemplatesPage() {
  const ctx = await requireUser();
  const templates = await listTemplates(ctx, { includeArchived: true });
  const active = templates.filter((t) => t.active);
  const archived = templates.filter((t) => !t.active);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reusable emails with placeholders that fill in each lead&apos;s details.
          </p>
        </div>
        <Link
          href="/templates/new"
          className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
        >
          New template
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm">
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
            <div key={t.templateId} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
              <Link href={`/templates/${t.templateId}`} className="font-medium hover:underline">
                {t.name}
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.subjectTemplate}</p>
              <p className="mt-2 text-xs text-slate-400">
                v{t.version} · updated {new Date(t.updatedAt).toLocaleDateString()}
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

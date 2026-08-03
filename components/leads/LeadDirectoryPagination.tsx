import Link from "next/link";

function pageHref(
  basePath: string,
  cursor: string | null,
  trail: string[]
): string {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (trail.length > 0) params.set("trail", trail.join(","));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function LeadDirectoryPagination({
  basePath,
  currentCursor,
  trail,
  nextCursor,
  shown,
  total,
}: {
  basePath: string;
  currentCursor: string | null;
  trail: string[];
  nextCursor: string | null;
  shown: number;
  total: number;
}) {
  const page = trail.length + (currentCursor ? 2 : 1);
  const previousCursor = currentCursor
    ? trail.at(-1) ?? null
    : null;
  const previousTrail = currentCursor ? trail.slice(0, -1) : [];
  const nextTrail = currentCursor ? [...trail, currentCursor] : trail;

  if (!currentCursor && !nextCursor) return null;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
      aria-label="Lead directory pages"
    >
      <p className="text-xs text-muted">
        Page {page.toLocaleString()} · {shown.toLocaleString()} shown · {total.toLocaleString()} total
      </p>
      <div className="flex gap-2">
        {currentCursor ? (
          <Link
            href={pageHref(basePath, previousCursor, previousTrail)}
            className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
          >
            Newer leads
          </Link>
        ) : null}
        {nextCursor ? (
          <Link
            href={pageHref(basePath, nextCursor, nextTrail)}
            className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
          >
            Older leads
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

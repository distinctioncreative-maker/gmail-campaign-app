export function TagChips({
  tags,
  limit = 3,
  className = "",
}: {
  tags: string[];
  limit?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, limit);
  const remaining = tags.length - shown.length;

  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`} role="list" aria-label="Lead tags">
      {shown.map((tag) => (
        <span
          key={tag}
          role="listitem"
          className="inline-flex max-w-40 items-center truncate rounded-full border border-border bg-surface-2 px-2 py-0.5 text-2xs font-medium text-foreground"
          title={tag}
        >
          {tag}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="text-2xs font-medium text-muted" aria-label={`${remaining} more tags`}>
          +{remaining}
        </span>
      ) : null}
    </span>
  );
}

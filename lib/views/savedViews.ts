/**
 * The rules a saved view follows, kept away from both Firestore and React.
 *
 * All pure, because the interesting behaviour is comparison and cleanup rather
 * than storage: which view is currently active, whether a name collides with one
 * that already exists, and what happens when a stored view mentions a filter the
 * table no longer has.
 */

/** Per surface, per user. Views are tabs above a table, and a row of thirty tabs
 * is worse than no tabs: past a dozen, finding the one you want costs more than
 * rebuilding the filter did. */
export const MAX_VIEWS_PER_SURFACE = 12;

export interface ViewState {
  filters: Record<string, string>;
  sortKey: string;
  sortDir: "asc" | "desc";
}

/**
 * Strip the filters that are at their default.
 *
 * Without this, every view stores every control including the empty ones, and
 * two views that differ in nothing compare as different because one recorded
 * `tag: ""` and the other omitted it.
 */
export function normalizeFilters(filters: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters ?? {})) {
    const trimmed = String(value ?? "").trim();
    // "all" is the conventional default for a segmented filter here, and a view
    // that stores it is a view that stores nothing.
    if (trimmed === "" || trimmed === "all") continue;
    out[key] = trimmed;
  }
  return out;
}

/** Names are compared case- and space-insensitively, because "Hot leads" and
 * "hot  leads" are one view as far as anybody reading the tabs is concerned. */
export function normalizeName(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export function sameState(a: ViewState, b: ViewState): boolean {
  if (a.sortKey !== b.sortKey || a.sortDir !== b.sortDir) return false;
  const left = normalizeFilters(a.filters);
  const right = normalizeFilters(b.filters);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/** Which stored view the table is currently showing, or null for none. */
export function activeViewId<T extends { viewId: string } & ViewState>(
  views: readonly T[],
  current: ViewState
): string | null {
  return views.find((view) => sameState(view, current))?.viewId ?? null;
}

/**
 * Apply a stored view to a table's controls.
 *
 * Unknown keys are dropped and missing ones fall back to the table's own
 * defaults, so a view saved before a filter was added or after one was removed
 * still works. The alternative, refusing to apply it, would break someone's
 * saved view on a deploy they had nothing to do with.
 */
export function applyView(
  stored: ViewState,
  knownKeys: readonly string[],
  defaults: Record<string, string>
): ViewState {
  const filters: Record<string, string> = {};
  for (const key of knownKeys) {
    filters[key] = stored.filters?.[key] ?? defaults[key] ?? "";
  }
  return { filters, sortKey: stored.sortKey, sortDir: stored.sortDir };
}

/** True when this state is worth saving at all. */
export function isEmptyState(state: ViewState): boolean {
  return Object.keys(normalizeFilters(state.filters)).length === 0 && state.sortKey === "";
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import {
  activeViewId,
  isEmptyState,
  MAX_VIEWS_PER_SURFACE,
  type ViewState,
} from "@/lib/views/savedViews";
import type { ViewSurface } from "@/schemas/savedView";

/**
 * Saved views as a tab strip above a table.
 *
 * Two decisions about how it behaves rather than how it looks:
 *
 * **The active tab is derived, not stored.** Whichever saved view matches the
 * current controls is highlighted. Tracking a "selected view" separately means
 * the highlight survives someone changing a filter, and then the tab is claiming
 * to describe a table it no longer describes.
 *
 * **Saving is only offered when there is something to save.** The default state
 * of a table is not a view, and an interface that lets you save it produces a tab
 * called "Everything" that does nothing.
 */

/**
 * What the reset tab is called, per surface.
 *
 * This read "All leads" unconditionally, which is correct on the one table the
 * bar is mounted on today and wrong on the other surface the schema already
 * allows. A hardcoded noun in a component parameterised by surface is a bug
 * waiting on its second caller, and the second caller is the kind of change
 * nobody thinks to re-read this file for.
 */
const RESET_LABELS: Record<ViewSurface, string> = {
  LEADS: "All leads",
  CAMPAIGNS: "All campaigns",
};

interface StoredView {
  viewId: string;
  name: string;
  filters: Record<string, string>;
  sortKey: string;
  sortDir: "asc" | "desc";
}

export function SavedViewBar({
  surface,
  current,
  onApply,
  onReset,
}: {
  surface: ViewSurface;
  current: ViewState;
  /** Applies a stored view to the table's controls. */
  onApply: (view: ViewState) => void;
  /** Returns the table to its defaults. */
  onReset: () => void;
}) {
  const toast = useToast();
  const [views, setViews] = useState<StoredView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchJson<{ views: StoredView[] }>(
        `/api/saved-views?surface=${surface}`
      );
      setViews(res.views);
    } catch {
      // A failed load leaves the strip empty rather than breaking the table
      // underneath it: views are a convenience, and the table is the feature.
      setViews([]);
    }
  }, [surface]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const active = activeViewId(views, current);
  const nothingToSave = isEmptyState(current);

  async function save() {
    setBusy(true);
    try {
      await fetchJson("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface,
          name,
          filters: current.filters,
          sortKey: current.sortKey,
          sortDir: current.sortDir,
        }),
      });
      setName("");
      setNaming(false);
      await load();
      toast("View saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(view: StoredView) {
    setBusy(true);
    try {
      await fetchJson("/api/saved-views", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId: view.viewId }),
      });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (views.length === 0 && nothingToSave) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {views.length > 0 ? (
        <>
          <button
            onClick={onReset}
            aria-pressed={active === null && nothingToSave}
            className={`min-h-11 rounded-md px-3 py-2 text-sm ${
              active === null && nothingToSave ? "bg-surface-2 font-medium" : "text-muted"
            }`}
          >
            {RESET_LABELS[surface]}
          </button>
          {views.map((view) => (
            <span
              key={view.viewId}
              className={`inline-flex items-center rounded-md ${
                active === view.viewId ? "bg-surface-2" : ""
              }`}
            >
              <button
                onClick={() =>
                  onApply({
                    filters: view.filters,
                    sortKey: view.sortKey,
                    sortDir: view.sortDir,
                  })
                }
                aria-pressed={active === view.viewId}
                className={`min-h-11 rounded-l-xl px-3 py-2 text-sm ${
                  active === view.viewId ? "font-medium" : "text-muted"
                }`}
              >
                {view.name}
              </button>
              <button
                onClick={() => void remove(view)}
                disabled={busy}
                aria-label={`Delete the ${view.name} view`}
                className="min-h-11 rounded-r-xl px-2 py-2 text-muted hover:text-danger disabled:opacity-50"
              >
                <Icon name="x" size={13} aria-hidden />
              </button>
            </span>
          ))}
        </>
      ) : null}

      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() !== "") void save();
              if (e.key === "Escape") setNaming(false);
            }}
            autoFocus
            placeholder="Name this view"
            maxLength={40}
            className="min-h-11 w-40"
          />
          <button
            onClick={() => void save()}
            disabled={busy || name.trim() === ""}
            className="btn-secondary min-h-11 px-3 py-2 text-sm disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setNaming(false)}
            className="btn-ghost min-h-11 px-2 py-2 text-sm"
          >
            Cancel
          </button>
        </span>
      ) : nothingToSave || views.length >= MAX_VIEWS_PER_SURFACE ? null : (
        <button
          onClick={() => setNaming(true)}
          className="btn-ghost flex min-h-11 items-center gap-1 px-3 py-2 text-sm"
        >
          <Icon name="plus" size={14} aria-hidden />
          {active === null ? "Save this view" : "Save as new view"}
        </button>
      )}
    </div>
  );
}

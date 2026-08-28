"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface LeadListOption {
  listId: string;
  name: string;
}

export type OrganizeLeadAction = "add_tag" | "remove_tag" | "add_to_list" | "remove_from_list";

export function BulkLeadOrganizer({
  selectedCount,
  availableTags,
  leadLists,
  busy,
  onApply,
}: {
  selectedCount: number;
  availableTags: string[];
  leadLists: LeadListOption[];
  busy: boolean;
  onApply: (action: OrganizeLeadAction, value: string) => Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [existingTag, setExistingTag] = useState(availableTags[0] ?? "");
  const [listId, setListId] = useState(leadLists[0]?.listId ?? "");

  const selectedExistingTag = availableTags.includes(existingTag) ? existingTag : (availableTags[0] ?? "");
  const selectedListId = leadLists.some((list) => list.listId === listId)
    ? listId
    : (leadLists[0]?.listId ?? "");

  async function addTag() {
    if (!tag.trim()) return;
    await onApply("add_tag", tag.trim());
    setTag("");
  }

  return (
    <details className="group mt-3 rounded-lg border border-border bg-surface-2/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border">
        <span className="flex items-center gap-2">
          <Icon name="tag" size={17} className="text-foreground" />
          Tag or move {selectedCount} selected lead{selectedCount === 1 ? "" : "s"}
        </span>
        <Icon name="chevronDown" size={16} className="text-muted transition group-open:rotate-180" />
      </summary>

      <div className="grid gap-4 border-t border-border p-3 lg:grid-cols-2">
        <fieldset className="min-w-0 rounded-lg bg-surface p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Tags</legend>
          <label className="mt-1 block text-xs font-medium text-foreground" htmlFor="bulk-new-tag">
            Add a tag
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="bulk-new-tag"
              list="lead-tag-suggestions"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTag();
                }
              }}
              maxLength={32}
              placeholder="Example: Decision maker"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
            />
            <datalist id="lead-tag-suggestions">
              {availableTags.map((item) => <option key={item} value={item} />)}
            </datalist>
            <button
              type="button"
              onClick={() => void addTag()}
              disabled={busy || !tag.trim()}
              className="btn-primary min-h-11 shrink-0 px-4 text-sm"
            >
              Add tag
            </button>
          </div>

          {availableTags.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-medium text-foreground" htmlFor="bulk-existing-tag">
                Remove an existing tag
                <select
                  id="bulk-existing-tag"
                  value={selectedExistingTag}
                  onChange={(event) => setExistingTag(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
                >
                  {availableTags.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onApply("remove_tag", selectedExistingTag)}
                disabled={busy || !selectedExistingTag}
                className="btn-secondary min-h-11 shrink-0 px-4 text-sm"
              >
                Remove tag
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Create the first tag above. Tags become reusable filters automatically.</p>
          )}
        </fieldset>

        <fieldset className="min-w-0 rounded-lg bg-surface p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Lead lists</legend>
          {leadLists.length > 0 ? (
            <>
              <label className="mt-1 block text-xs font-medium text-foreground" htmlFor="bulk-lead-list">
                Choose a list
              </label>
              <select
                id="bulk-lead-list"
                value={selectedListId}
                onChange={(event) => setListId(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
              >
                {leadLists.map((list) => <option key={list.listId} value={list.listId}>{list.name}</option>)}
              </select>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void onApply("add_to_list", selectedListId)}
                  disabled={busy || !selectedListId}
                  className="btn-primary min-h-11 px-3 text-sm"
                >
                  Add to list
                </button>
                <button
                  type="button"
                  onClick={() => void onApply("remove_from_list", selectedListId)}
                  disabled={busy || !selectedListId}
                  className="btn-secondary min-h-11 px-3 text-sm"
                >
                  Remove from list
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">A lead can belong to several lists. Repeated assignments are safely ignored.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Create a lead list above, then select leads here to organize them into it.</p>
          )}
        </fieldset>
      </div>
    </details>
  );
}

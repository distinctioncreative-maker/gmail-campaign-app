"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

interface ProposedGroup {
  name: string;
  reason: string;
  contactIds: string[];
  sample: string[];
}

/**
 * Turn a pile of leads into groups worth writing different emails to.
 *
 * The flow is propose, review, apply, and the review step is not ceremony. The
 * model is grouping real companies by what they appear to do, and it will
 * sometimes be confidently wrong about one of them. Applying hundreds of tags on
 * a single press would make that mistake expensive to find and tedious to undo,
 * so every group is shown with its reason and a few example businesses, each is
 * individually checkable, and nothing is written until someone presses apply.
 *
 * Groups arrive selected. The common case is that the proposal is broadly right,
 * and making someone tick six boxes to accept what they already agreed with is
 * the kind of friction that gets a feature abandoned.
 */
export function OrganizeLeads() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [groups, setGroups] = useState<ProposedGroup[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchJson<{ groups: ProposedGroup[]; reason?: string }>(
        "/api/leads/organize"
      );
      setGroups(res.groups);
      setChosen(new Set(res.groups.map((g) => g.name)));
      if (res.groups.length === 0) {
        setError(res.reason ?? "Nothing obvious to group on yet.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read your leads.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!groups) return;
    const selected = groups.filter((g) => chosen.has(g.name));
    if (selected.length === 0) return;
    setApplying(true);
    try {
      const res = await fetchJson<{ tagged: number; skipped: number }>("/api/leads/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: selected.map((g) => ({ name: g.name, contactIds: g.contactIds })),
        }),
      });
      toast(
        `Tagged ${res.tagged.toLocaleString()} lead${res.tagged === 1 ? "" : "s"}.`,
        "success"
      );
      setGroups(null);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not apply those groups.", "error");
    } finally {
      setApplying(false);
    }
  }

  function toggle(name: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const selectedCount = groups
    ? groups.filter((g) => chosen.has(g.name)).reduce((sum, g) => sum + g.contactIds.length, 0)
    : 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5">
            <Icon name="sparkles" size={16} aria-hidden />
            Group these leads
          </h2>
          <p className="mt-1 text-sm text-muted">
            Sorts your leads by what each business does, so you can write to a trade rather
            than to everyone at once. You approve the groups before anything is tagged.
          </p>
        </div>
        {!groups && (
          <button
            type="button"
            onClick={() => void propose()}
            disabled={busy}
            className="btn-primary shrink-0 px-3 py-1.5 text-sm"
          >
            {busy ? "Reading your leads…" : "Suggest groups"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-muted">{error}</p>}

      {groups && groups.length > 0 && (
        <>
          <ul className="mt-4 space-y-2">
            {groups.map((group) => {
              const on = chosen.has(group.name);
              return (
                <li key={group.name}>
                  <label
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-(--dur-fast) ${
                      on ? "border-info bg-info-soft" : "border-border hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(group.name)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="badge bg-surface-2 text-foreground">{group.name}</span>
                        <span className="text-xs tabular-nums text-muted">
                          {group.contactIds.length.toLocaleString()} leads
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">{group.reason}</span>
                      {/* Named examples, because a count and a label give a
                          reviewer no way to tell a good group from a wrong one. */}
                      {group.sample.length > 0 && (
                        <span className="mt-0.5 block text-xs text-muted">
                          e.g. {group.sample.join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={applying || selectedCount === 0}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              {applying
                ? "Tagging…"
                : `Tag ${selectedCount.toLocaleString()} lead${selectedCount === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setGroups(null)}
              disabled={applying}
              className="text-sm text-muted hover:underline"
            >
              Discard
            </button>
            <span className="text-xs text-muted">
              Adds a tag. Nothing is moved, removed, or emailed.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

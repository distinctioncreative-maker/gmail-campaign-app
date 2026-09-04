"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { fetchJson } from "@/lib/fetchJson";
import { defaultResults, type ActionContext } from "@/lib/search/actions";
import { flattenGroups, groupResults, type PaletteResult } from "@/lib/search/rank";

/**
 * Cmd-K.
 *
 * Built on a plain dialog and a listbox rather than a palette library, for the
 * same reason the Stripe client here is hand-rolled: the whole thing is a
 * filtered list and a keydown handler, and a dependency would be more code to
 * audit than to write.
 *
 * Keyboard behaviour is the feature, not decoration on it. Someone who reaches
 * for Cmd-K never intends to touch the mouse again, so every path out of here
 * works from the keyboard: arrows wrap, Enter opens, Escape closes, and the
 * highlight follows the drawn order across group boundaries.
 */

const DEBOUNCE_MS = 140;

export function CommandPalette({ actionContext }: { actionContext: ActionContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [prefixOnly, setPrefixOnly] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fallback = useMemo(() => defaultResults(actionContext), [actionContext]);
  const shown = query.trim().length >= 2 ? results : fallback;
  const flat = useMemo(() => flattenGroups(shown), [shown]);
  const sections = useMemo(() => groupResults(shown), [shown]);

  // Resetting lives in the handlers rather than in an effect on `open`.
  // Clearing state from an effect means a render with the old query still on
  // screen before the reset lands, which is visible as a flash of the previous
  // search every time the palette reopens.
  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setActive(0);
    setLoading(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Cmd-K on a Mac, Ctrl-K elsewhere. Also Cmd-/ because some browsers and
  // extensions swallow Cmd-K, and a shortcut that silently does nothing is
  // indistinguishable from a feature that does not exist.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const combo = (event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "/");
      if (!combo) return;
      event.preventDefault();
      setOpen((was) => !was);
      reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  useEffect(() => {
    // A DOM side effect, which is what an effect is for. Focus has to move
    // here or the shortcut opens a box that ignores the next keystroke.
    if (open) inputRef.current?.focus();
  }, [open]);

  function onQueryChange(value: string) {
    setQuery(value);
    setActive(0);
    const trimmed = value.trim();
    // Set from the event, not from an effect: the effect below only schedules
    // the request, so its body never calls setState and cannot cascade.
    setLoading(trimmed.length >= 2);
    if (trimmed.length < 2) setResults([]);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    // Debounced, and every in-flight request is discarded when a newer one
    // starts: without the guard a slow response for "ac" can land after the
    // fast one for "acme" and replace correct results with stale ones.
    let current = true;
    const timer = setTimeout(() => {
      fetchJson<{ results: PaletteResult[]; leadsPrefixOnly: boolean }>(
        `/api/search?q=${encodeURIComponent(trimmed)}`
      )
        .then((res) => {
          if (!current) return;
          setResults(res.results);
          setPrefixOnly(res.leadsPrefixOnly);
          setActive(0);
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const go = useCallback(
    (result: PaletteResult | undefined) => {
      if (!result) return;
      close();
      router.push(result.href);
    },
    [router, close]
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      // Wraps, because reaching the end and having the highlight stick is a
      // dead end you have to notice and reverse out of.
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(flat[active]);
    }
  }

  // Keep the highlighted row on screen when the arrows walk past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, shown]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted hover:text-foreground sm:flex"
        aria-label="Search and commands"
      >
        <Icon name="search" size={15} aria-hidden />
        <span>Search</span>
        {/* The shortcut is printed on the affordance, because a keyboard
            feature nobody knows about is a keyboard feature nobody uses. */}
        <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-sans text-3xs font-medium">
          ⌘K
        </kbd>
      </button>
    );
  }

  const activeId = flat[active] ? `palette-option-${flat[active].id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-overlay flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Icon name="search" size={18} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search campaigns, leads, templates, or type a command"
            className="w-full bg-transparent py-4 placeholder:text-muted"
            role="combobox"
            aria-expanded
            aria-controls="palette-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-sans text-3xs text-muted sm:block">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="palette-listbox"
          role="listbox"
          aria-label="Results"
          className="max-h-[min(60vh,26rem)] overflow-y-auto py-2"
        >
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              {loading
                ? "Searching…"
                : query.trim().length >= 2
                  ? "Nothing matched. Leads match the start of an email or company name."
                  : "Type to search, or pick something above."}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.group} className="px-2 py-1">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                  {section.group}
                </p>
                {section.items.map((item) => {
                  const index = flat.indexOf(item);
                  const isActive = index === active;
                  return (
                    <button
                      key={item.id}
                      id={`palette-option-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      // Pointer move rather than enter: the mouse resting
                      // still while the arrows move must not yank the
                      // highlight back under the cursor.
                      onPointerMove={() => setActive(index)}
                      onClick={() => go(item)}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left ${
                        isActive ? "bg-surface-2" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.text}</span>
                        {/* Keywords are matched, never shown: they exist so
                            the person does not need to know our vocabulary. */}
                        {item.group !== "Actions" && item.group !== "Pages" && item.subtext ? (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {item.subtext}
                          </span>
                        ) : null}
                      </span>
                      {item.meta ? (
                        <span className="shrink-0 text-2xs uppercase tracking-wide text-muted">
                          {item.meta}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-2xs text-muted">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
          {prefixOnly ? <span>Leads match from the start of an email or company</span> : null}
        </div>
      </div>
    </div>
  );
}

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where the documentation lives

Only three markdown files sit at the repo root: `README.md` (what Cadence is
and how to run it), this file, and `CLAUDE.md` (which just points here).
Everything else is under [`docs/`](docs/README.md) — start at that index.
Point-in-time snapshots live in `docs/history/` and are deliberately not
maintained; when one disagrees with a doc in `docs/`, the doc in `docs/` wins.

# Cross-agent handoff (read before editing)

Cadence is actively maintained with both ChatGPT Codex and Claude Code.
Before changing this branch, read `docs/history/hardening-handoff.md`,
`docs/history/public-launch-audit.md`, `docs/campaign-safety.md`, `docs/security.md`, and
`docs/architecture.md`, then run:

```bash
git status --short
git log --oneline -12
```

Treat existing uncommitted changes as another agent's work. Do not discard,
reformat wholesale, push, deploy, change cloud resources, or enable
`SIGNUP_MODE=open` without explicit user authorization. Record current
quality-gate results and unresolved external steps in
`docs/history/hardening-handoff.md` before handing control to the other agent.

# Documentation upkeep (required for every change)

Cadence keeps three things in sync so documentation never silently rots:
`lib/features/registry.ts` (the single source of truth) → `docs/features.md`
(generated) → the in-app checklist at `/admin/features` (reads the registry
directly, live). `README.md` and `docs/architecture.md` are hand-maintained and
describe structure/positioning rather than per-feature status.

Whenever a change ships, changes, or removes a feature — including changes
made in this chat — do this before considering the task done:

1. **Add/update/remove the entry** in `lib/features/registry.ts` (correct
   category, status: `shipped` / `beta` / `planned`, one or two honest
   sentences, `keyFiles` pointing at what you touched).
2. **Regenerate the doc**: `npm run docs:features`. Never hand-edit
   `docs/features.md` directly — it's overwritten by the generator.
3. **If the change alters structure** (a new top-level route, a new `lib/`
   module, a new API route group, a new way of doing something like the
   admin-tab pattern) — update `docs/architecture.md` too.
4. **If the change alters positioning or the roadmap** (what the product is
   for, what's next before launch) — update the relevant section of
   `README.md`.
5. Run the usual quality gate (`tsc --noEmit`, `lint`, `test`, `build`)
   before committing — doc updates ride in the same commit as the code
   change they describe, not a separate pass "later."

Skip this only for changes with no feature-visible effect (pure refactors,
dependency bumps, formatting).

# Use the shared UI components, do not hand-roll them

Every one of these exists because the hand-rolled version had drifted into a
dozen slightly different treatments, which is the single biggest reason the
app used to read as unpolished. Reach for the component first; if it cannot
express what you need, extend the component rather than opening a new
one-off.

| Need | Use | Never |
|---|---|---|
| Page title, optional back link, action slot | `components/ui/PageHeader.tsx` | A hand-rolled `<h1>` plus a `←` link |
| A KPI number | `components/ui/StatTile.tsx` (`StatTile` + `StatGrid`) | A `card` with your own `text-2xl font-semibold` |
| "Nothing here yet" | `components/ui/EmptyState.tsx` (`variant="page"` for a first-run surface, `"inline"` for a sub-panel) | A `card p-8 text-center text-sm text-muted` |
| A line icon | `components/ui/Icon.tsx` | An emoji, or an inline `<svg>` |
| A number that should animate in | `components/ui/CountUp.tsx` | A raw `toLocaleString()` in a headline slot |

`StatTile`'s `tone` drives both the number and its icon chip, so pass the
meaning (`revenue`, `success`, `warning`, `danger`, `primary`) rather than a
colour class. Per [docs/brand.md](docs/brand.md) the `revenue` tone is
rationed to money moments — replies, interested leads, pipeline. If every
number on a page is gold, none of them are.

# Page files compose, they do not compute

A route file should read as a list of what the customer sees. When a page
starts interleaving data loading, aggregation, and 300 lines of JSX, split
it three ways, as `reports` and `home` are:

- `lib/<area>/<name>.ts` — the loading plus a `load…()` that returns one
  typed object, with the arithmetic exported as pure functions so it can be
  tested without a Firestore stub.
- `components/<area>/<Name>Sections.tsx` — the presentational blocks, each
  taking only the slice it draws.
- `app/…/page.tsx` — parse params, call the loader, compose the blocks.

Extracted arithmetic is expected to come with tests. See
`tests/unit/report-aggregation.test.ts` and `tests/unit/home-dashboard.test.ts`.

# Copy: no em-dashes

Not in the app, not on the marketing site, not in customer-facing strings.
Use a colon, a full stop, or restructure the sentence. Voice rules are in
[docs/brand.md](docs/brand.md): lead with the outcome, one idea per
sentence, concrete over abstract, confident without hype.

# Theming: use tokens, not hardcoded Tailwind colors

The app supports light/dark mode via a `data-theme` attribute on `<html>`
(`app/globals.css`). Never use raw Tailwind color utilities for surfaces,
text, or borders — `bg-white`, `bg-slate-50`/`100`/`200`, `text-slate-400`
through `text-slate-900`, `border-slate-*`, `divide-slate-*`. These only
have a light-mode value; used directly, they either stay light-only or
depend on a manually maintained override list in `globals.css` that is easy
to under-cover (exactly what caused the dark-mode readability bugs fixed in
2026-07).

Use the semantic tokens instead, all registered in `app/globals.css`'s
`@theme inline` block and safe in both themes:

| Instead of | Use |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-slate-50` / `bg-slate-100` | `bg-surface-2` |
| `bg-slate-200` (and similar mid-tone fills, e.g. chart tracks) | `bg-border` |
| `text-slate-700` / `800` / `900` | `text-foreground` |
| `text-slate-500` / `600` | `text-muted` |
| `text-slate-300` / `400` (faint hint text) | `text-muted/50` or `text-muted/70` |
| `border-slate-*`, `divide-slate-*` | `border-border`, `divide-border` |

Status tints (`bg-green-50`/`text-green-700`, `bg-red-100`, `bg-amber-50`,
etc.) are a separate system — but only the shades actually listed in the
dark-mode override table in `globals.css` are covered (currently the
`*-50`/`*-100`/`*-700` shades of red/green/amber). **Darker shades like
`text-red-800`, `border-red-200`/`border-amber-300`, etc. are NOT covered**
and render washed out in dark mode — this bit several real components
(toasts, the site-wide test-mode banner, danger-confirmation panels) before
being caught in 2026-07. For a tinted panel (border + background), use the
`.alert-danger` / `.alert-success` / `.alert-warning` / `.alert-info` classes in
`globals.css` instead of hand-picking Tailwind shades; for a solitary danger
button, use `.btn-danger`; for standalone text/border color, use the
Tailwind utilities `text-danger`/`text-success`/`text-warning`/
`border-danger` etc. (auto-generated from the `--color-danger` /
`--color-success` / `--color-warning` / `--color-info` tokens registered in `@theme inline` —
these don't need a dark override since the token's hex value already has
enough contrast on both a near-white and a near-black surface, the same way
`.btn-danger` has always worked). A fully solid/opaque tint (e.g. a solid
`bg-red-600` CTA with white text) doesn't need any of this — it's the same
color in both themes by design, only semi-transparent/light tints on a
variable surface are the risk. Deliberately theme-invariant elements (modal
backdrops, always-dark tooltips) may keep `bg-slate-900` on purpose; that's
not a bug.

If you introduce a genuinely new hardcoded slate/white class, either replace
it with an existing token above, or extend `@theme inline` with a new token
first — do not add another line to the dark-mode override list in
`globals.css`; that list is a last-resort safety net, not where new styling
should be added.

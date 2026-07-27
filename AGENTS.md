<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documentation upkeep (required for every change)

Cadence keeps three things in sync so documentation never silently rots:
`lib/features/registry.ts` (the single source of truth) → `FEATURES.md`
(generated) → the in-app checklist at `/admin/features` (reads the registry
directly, live). `README.md` and `ARCHITECTURE.md` are hand-maintained and
describe structure/positioning rather than per-feature status.

Whenever a change ships, changes, or removes a feature — including changes
made in this chat — do this before considering the task done:

1. **Add/update/remove the entry** in `lib/features/registry.ts` (correct
   category, status: `shipped` / `beta` / `planned`, one or two honest
   sentences, `keyFiles` pointing at what you touched).
2. **Regenerate the doc**: `npm run docs:features`. Never hand-edit
   `FEATURES.md` directly — it's overwritten by the generator.
3. **If the change alters structure** (a new top-level route, a new `lib/`
   module, a new API route group, a new way of doing something like the
   admin-tab pattern) — update `ARCHITECTURE.md` too.
4. **If the change alters positioning or the roadmap** (what the product is
   for, what's next before launch) — update the relevant section of
   `README.md`.
5. Run the usual quality gate (`tsc --noEmit`, `lint`, `test`, `build`)
   before committing — doc updates ride in the same commit as the code
   change they describe, not a separate pass "later."

Skip this only for changes with no feature-visible effect (pure refactors,
dependency bumps, formatting).

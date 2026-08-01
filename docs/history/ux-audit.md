# User-Friendliness Audit

Audit of the app for a non-technical sales team, and what was done in this pass.

## What was improved

| Area | Problem found | Fix shipped |
|---|---|---|
| Orientation | No sense of "where am I / where do I start" | Interactive click-through **tour** (auto-runs once, replayable from Help), highlighting the real sidebar items + bell |
| Learnability | Nowhere to look things up | **Help center** with expandable how-to guides (connect Gmail, import leads, templates, signature, campaigns, follow-ups), FAQ, and the Test Center |
| Jargon | Terms like "CAN-SPAM address", "daily cap", "prior-contact policy", "draft-only" unexplained | Reusable **HelpTip** `?` tooltips on the trickiest fields, in plain language |
| Fear of sending | Users unsure whether clicking "Start" emails real people | Always-visible **mode banner** (amber "test — safe" / green "live"); the campaign wizard's final step restates it; admin **go-live switch** with checklist + typed confirmation |
| Navigation | No active-page indication; cramped mobile nav | New **sidebar** with icons + active highlighting; proper mobile drawer |
| First impressions | Plain sign-in; dashboard showed fake zeros | Redesigned **sign-in**; **home** now shows real stats, recent campaigns, and quick-action cards |
| Visual system | Flat, generic surfaces | Refined **design tokens** (surfaces, borders, accent, soft gradient, focus rings), `.card`/`.btn-primary` utilities |
| Status wording | Machine statuses (ACTIVE, PAUSED…) | Friendly labels everywhere (Sending, Paused, Finished, Needs attention) via `statusLabels` |

## Principles applied

- **Safe by default**: test mode is on until an admin deliberately goes live; every screen shows the current mode.
- **Plain language**: no queue IDs, no Gmail API terms, no stack traces — friendly errors and activity feeds only.
- **Progressive disclosure**: guided wizards for onboarding, imports, templates, campaigns, and sequences; advanced options tucked behind clear toggles.
- **Reassurance at decision points**: previews before sending, a safety-review step, and mode reminders right where the user clicks "Start".

## Recommended next steps (not yet done)

- Replace `window.confirm`/`prompt` calls (suppression remove, campaign controls) with in-app modal dialogs + toast notifications for a more polished feel.
- Add skeleton loaders to client-fetched lists (campaign wizard, Test Center) instead of "Loading…" text.
- Add short inline video/GIF walkthroughs to the Help guides.
- Localize copy if any reps prefer another language.
- Usability test with 2–3 actual salespeople and fold in what confuses them.

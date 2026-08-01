# Cadence brand system

The single source of truth for how Cadence looks and sounds. Tokens live in
`app/globals.css`; this file explains the intent behind them so choices stay
consistent as the product grows.

## Who we are talking to

Marketing and sales teams. They are commercially motivated, allergic to fluff,
and judge software on whether it makes them money. They are not engineers, so
nothing should require technical vocabulary to understand.

The feel we are aiming for: **warm, premium, and confident**. Closer to Notion
than to a bank dashboard. Serious enough for procurement, human enough to enjoy
using every day.

## Voice

Write like a sharp colleague who is great at their job, not like documentation.

**Rules**

1. **Lead with the outcome, not the mechanism.** The reader cares what they get.
   Put the how in a supporting line, if at all.
2. **One idea per sentence.** No comma-spliced feature lists. If a sentence
   contains three capabilities, it is three sentences or, better, one sentence
   and two cuts.
3. **Concrete over abstract.** Numbers, outcomes, and plain nouns beat
   "streamline", "leverage", "robust", and "seamless".
4. **Confident, never hypey.** No exclamation marks, no "revolutionary". The
   confidence comes from specificity.
5. **No em-dashes.** Use a period, a comma, or a colon.

**Before and after**

> Upload a CSV, paste email addresses, or choose a saved list. Cadence
> validates fields, finds duplicates, and checks suppressions.

That is a spec sheet. Instead:

> Bring your list. We clean it before it can cost you a domain.

## Typography

| Role | Face | Where |
|---|---|---|
| Display | Plus Jakarta Sans (700/800) | Headings, hero, numbers that matter |
| Text | Inter | Body, UI, tables, forms |
| Mono | JetBrains Mono | Data, tokens, technical labels |

Headings are set tight (`-0.028em`, `-0.034em` at h1). Tight tracking on a
geometric face is most of what makes type look designed rather than default.

## Colour

Warm neutrals, one action colour, one rationed revenue accent.

| Token | Light | Meaning |
|---|---|---|
| `--background` | `#f7f5f2` | Warm paper. Never cold grey. |
| `--surface` | `#ffffff` | Cards, panels |
| `--foreground` | `#1d1b18` | Warm near-black. Never pure black. |
| `--muted` | `#6b655e` | Secondary text |
| `--border` | `#e8e3dc` | Hairlines |
| `--primary` | `#5b47e0` | Indigo-violet. Actions, focus, brand. |
| `--revenue` | `#b07d2e` | Money only: pipeline, replies won, revenue |
| `--success` | `#0e9f6e` | Positive state |
| `--warning` | `#cc7a00` | Deliverability risk |
| `--danger` | `#d94452` | Destructive, failure |

### Public marketing neutrals

The public landing page is intentionally theme-invariant. A visitor should
see the same warm Cadence palette whether or not a saved dashboard theme is
present in the browser. The `--marketing-*` tokens in `app/globals.css` own
that ramp:

| Token | Value | Use |
|---|---|---|
| `--marketing-paper` | `#f7f5f2` | Main page background |
| `--marketing-surface` | `#ffffff` | Product frames and cards |
| `--marketing-copy` | `#1d1b18` | Headings and primary text |
| `--marketing-muted` | `#6b655e` | Secondary text, 5.29:1 on paper |
| `--marketing-border` | `#e8e3dc` | Hairlines and resting borders |
| `--marketing-ink` | `#0f0d0c` | Hero, trust, CTA, and footer bands |
| `--marketing-on-ink` | `#f9f7f4` | Primary text on ink, 18.13:1 |
| `--marketing-on-ink-muted` | `#c4bdb5` | Secondary text on ink, 10.43:1 |
| `--marketing-on-ink-subtle` | `#a9a199` | Tertiary text on ink, 7.61:1 |

`components/marketing/landing.module.css` must contain no literal hex colors.
Use these tokens, a semantic product token, or `color-mix()` derived from
them. Body text must reach at least 4.5:1 against its actual surface. Large
text and meaningful graphical controls must reach at least 3:1.

### Primary color decision

The current indigo-violet remains in place until the founder chooses a new
direction. The exact AA-compliant candidates, risks, and token replacements
are documented in [brand-primary-options.md](brand-primary-options.md). Do not
change `--primary` without recording that choice there and updating both
light and dark theme tokens.

**The revenue accent is rationed on purpose.** If it appears everywhere it stops
meaning money. Use it for the numbers a customer would screenshot for their boss.

Dark mode is warm-toned charcoal (`#0e0d0c`, `#191716`) with a lifted primary
(`#8b78ff`) so it reads as the same brand rather than a different product.

## Shape, depth, motion

- **Radius**: `--radius-sm` 8px controls, `--radius-md` 12px inputs and chips,
  `--radius-lg` 16px cards, `--radius-xl` 22px feature surfaces. Do not invent
  new values inline.
- **Elevation**: `--shadow-sm` resting, `--shadow-md` raised, `--shadow-lg`
  floating, `--shadow-brand` for primary emphasis only.
- **Motion**: `--dur-fast` 140ms for hovers, `--dur-base` 220ms for most
  transitions, `--dur-slow` 420ms for entrances. Always `--ease-out`.
  Everything must respect `prefers-reduced-motion`.

Restraint is the point. Luxury reads as a few well-crafted moments plus calm
everywhere else, not as motion on every element.

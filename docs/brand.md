# Cadence brand system

The single source of truth for how Cadence looks and sounds. Tokens live in
`app/globals.css`; this file explains the intent behind them so choices stay
consistent as the product grows.

## Who we are talking to

Marketing and sales teams. They are commercially motivated, allergic to fluff,
and judge software on whether it makes them money. They are not engineers, so
nothing should require technical vocabulary to understand.

The feel we are aiming for: **calm, precise, and expensive**. Closer to Notion
than to a bank dashboard. Serious enough for procurement, pleasant enough to
stare at all day.

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
| Display | Inter Tight (600/620) | Headings, hero, numbers that matter |
| Text | Inter | Body, UI, tables, forms |
| Mono | JetBrains Mono | Data, tokens, technical labels |

One superfamily, two optical sizes. A single family across the whole product
is what makes an interface feel seamless rather than assembled. This replaced
a display serif (Fraunces), which had character but read as editorial and
slightly quirky rather than as enterprise software.

Headings are set tight (`-0.021em`, `-0.032em` at h1). `.display-figure` owns
the headline-number treatment, with tabular figures so digits do not jitter as
live values tick. Do not reimplement it per component.

## Colour

Cool, high-contrast neutrals. Two accents, two meanings, nothing else:

- **Blue** means clickable, or the product speaking.
- **Green** means finished, or working right now.

A third hue is what turned an earlier palette into noise. Money shares the
green, because a reply is an outcome and should read as the same "good" as a
completed send.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--background` | `#f1f4f8` | `#0b0f17` | Page. A card separates at 1.10:1. |
| `--surface` | `#ffffff` | `#131a26` | Cards, panels |
| `--surface-2` | `#e7eaef` | `#1b2331` | Inset panels, progress-bar tracks |
| `--foreground` | `#0f1729` | `#e8edf5` | 16.20:1 and 16.31:1 on the page |
| `--muted` | `#5a6478` | `#98a3b5` | Secondary text, 5.39:1 and 7.53:1 |
| `--border` | `#c7cfdd` | `#374557` | Hairlines, 1.57:1 and 1.79:1 on a card |
| `--primary` | `#2354c7` | `#6e9bff` | The action colour, 6.64:1 and 6.48:1 |
| `--info` | `#3e4a5c` | `#a9b6c8` | Cool slate for AI and system guidance. Not a hue. |
| `--success` / `--revenue` | `#167c52` | `#3dbe8b` | Progress, positive state, money |
| `--warning` | `#92510a` | `#e0a64a` | Deliverability risk |
| `--danger` | `#b3261e` | `#f2777f` | Destructive, failure |

This replaced a warm ivory-and-brass ramp, which read yellow on most screens
and whose surfaces did not separate: a card sat 1.06:1 against the page under
a 1.29:1 hairline, so nothing on screen looked like an object.

Muted body copy always uses the full `--muted` token. Status colours are
measured as normal-size text against both background and surface in both
themes. Solid fills use dedicated success, warning, and danger contrast tokens
rather than assuming white text stays readable.

**Progress bars have one rule.** The track is always `--surface-2`. The fill is
always a status or action colour: green for progress toward completion, blue
for the magnitude of a value beside its peers. A fill must never share its
track's token. Three bars once shipped that way, two of them at 1.00:1, and
`tests/unit/brand-palette.test.ts` now walks every width-styled fill in `app/`
and `components/` to keep it from happening again.

**Accent placement is rationed on purpose.** If blue appears everywhere it
stops meaning "click this". Aim for one primary action per view.

### Public marketing neutrals

The public landing page is intentionally theme-invariant. A visitor should see
the same palette whether or not a saved dashboard theme is in the browser. The
`--marketing-*` tokens in `app/globals.css` own that ramp and mirror the light
theme, plus a navy ink band:

| Token | Value | Use |
|---|---|---|
| `--marketing-paper` | `#f1f4f8` | Main page background |
| `--marketing-surface` | `#ffffff` | Product frames and cards |
| `--marketing-copy` | `#0f1729` | Headings and primary text |
| `--marketing-muted` | `#5a6478` | Secondary text |
| `--marketing-border` | `#c7cfdd` | Hairlines and resting borders |
| `--marketing-ink` | `#0f1729` | Hero, trust, CTA, and footer bands |
| `--marketing-on-ink` | `#e8edf5` | Primary text on ink |
| `--marketing-on-ink-muted` | `#a3afc2` | Secondary text on ink |
| `--marketing-on-ink-subtle` | `#8794a8` | Tertiary text on ink |
| `--marketing-primary` | `#2354c7` | Theme-invariant actions and selection |
| `--marketing-info` | `#3e4a5c` | Theme-invariant slate for AI atmosphere |

`components/marketing/landing.module.css` must contain no literal hex colours
and no non-neutral `rgb()`. Use these tokens, a semantic product token, or
`color-mix()` derived from them. A hex-only ban once let roughly fifty cold
blue and green `rgb()` literals survive a migration, hidden inside shadows,
glows, and gradients. Body text must reach at least 4.5:1 against its actual
surface; large text and meaningful graphical controls at least 3:1.

## Shape, depth, motion

- **Radius**: `--radius-sm` 3px, `--radius-md` 5px, `--radius-lg` 8px cards,
  `--radius-xl` 10px feature surfaces. Do not invent new values inline. The
  landing page bridges the same ladder through `--landing-r-*`.
- **Elevation**: there is none. `--shadow-sm`, `--shadow-md`, and
  `--shadow-brand` are `none`, and definition comes from `--border` and from
  the space around a panel. A large soft shadow reads cheap; a hairline reads
  considered. Inset focus and selection rings are the one exception.
- **Motion**: `--dur-fast` 140ms for hovers, `--dur-base` 220ms for most
  transitions, `--dur-slow` 420ms for entrances. Always `--ease-out`.
  Everything must respect `prefers-reduced-motion`.
- **Nothing loops in peripheral vision.** Motion is allowed when it responds to
  the reader or reports something real: a walkthrough advancing, a live status
  dot, a light following the pointer. Orbiting halos, drifting glow dots, and
  sheens sweeping across a frame on a timer are not.

Restraint is the point. Luxury reads as a few well-crafted moments plus calm
everywhere else, not as motion on every element.

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
| Display | Inter Tight | Headings, hero, figures that matter |
| Text | Inter | Body, UI, tables, forms |
| Mono | JetBrains Mono | Data, tokens, technical labels |

One superfamily, two optical sizes. A single family across the whole product is
what makes an interface feel seamless rather than assembled.

**The scale is in `app/globals.css` and everything uses it.** There are no
arbitrary sizes, and a guard enforces that. `--text-3xs` 10px through
`--text-5xl`, with `--text-base` at 15px as the body size.

Two things worth stating because their absence caused the largest single visual
defect this product has had:

**`body` states a font size.** It did not, so the browser default of 16px was
inherited and every element in the product overrode it downward. A census found
1,005 of 1,063 sizing utilities at 13px or smaller and, of 460 paragraphs, none
at body size. Nothing was designed small. It drifted small one call site at a
time because there was nothing to inherit.

**Headings state a size too.** Tailwind's preflight resets them to `inherit`,
so an `<h2>` rendered at body size and a section heading was the same size as
the sentence under it, differing only in weight. Heading sizes are set in
`@layer base` so a call site may still override them.

Weight is 400 for prose, 500 for labels and the one element in a group that
leads, 600 for headings. Do not restate a heading's weight at a call site: the
rule in `globals.css` is unlayered and beats any utility, so a `font-semibold`
on an `<h2>` does nothing while looking like the thing that set it.

## Colour

**Dark is the default.** The app is a control system for something that is
running. Light is a supported choice, not an afterthought, and is measured to
the same standard.

Two accents, two meanings, and nothing else decorative:

- **Indigo** is the action, and Cadence itself. Buttons, links, focus, the
  Cadence Line, mail we sent.
- **Mint** is the result. Replies, healthy sending, anything that worked.

Status keeps amber and red. Those four are the only colours a screen may
contain.

| Token | Dark (default) | Light | Meaning |
|---|---|---|---|
| `--background` | `#08090b` | `#f1f3f7` | Page |
| `--surface` | `#17191e` | `#ffffff` | Cards. 1.13:1 and 1.11:1 over the page |
| `--surface-2` | `#1f222c` | `#e8ebf1` | Insets, table headers |
| `--foreground` | `#f5f7fa` | `#0d1017` | 18.56:1 and 17.13:1 on the page |
| `--muted` | `#a0a9b8` | `#5a6273` | Secondary text |
| `--muted-2` | `#8a93a4` | `#626a7c` | Metadata, the quietest text |
| `--border` | `#34373e` | `#d3d8e1` | Hairlines, 1.48:1 and 1.40:1 on a card |
| `--primary` | `#6d7cff` | `#4a55ce` | The action colour |
| `--success` | `#43d6a4` | `#0b6e50` | Replies, healthy state |
| `--warning` | `#f1b955` | `#8a5a00` | Deliverability risk |
| `--danger` | `#ff7079` | `#c03024` | Destructive, failure |
| `--info` | `#a0a9b8` | `#5a6273` | AI and system guidance. A neutral, not a hue. |
| `--revenue` | `#f5f7fa` | `#0d1017` | Money. The figure carries itself. |

**The primary button's label is `--primary-contrast`, which is near-black on
dark.** White on `#6d7cff` measures 3.51:1 and fails. Near-black is 5.67:1, and
the same indigo is 5.67:1 as text on the page, so one token covers the fill and
the text.

**Indigo text on an indigo-tinted chip uses `--primary-hover`.** The base value
never reaches AA on its own soft fill at any alpha.

**The neutral ramp is nearly neutral, and this is load-bearing.** A warm accent
on a warm ground, or a blue accent on a blue-grey ground, has nothing to
separate from. Two palettes have failed here. The gold one had greys at hue 90
under a gold accent and a warning colour four degrees from that accent. Chroma
on every neutral stays at or below 8, and `tests/unit/brand-palette.test.ts`
measures it.

**Colours that mean different things must look different.** Any two of indigo,
mint, amber and red are at least 25 degrees apart on the wheel; the tightest
real pair is 57.9.

**Progress bars have one rule.** The track is always `--surface-2`, the fill is
always a status or action colour, and a fill must never share its track's
token. Three bars once shipped that way, two at 1.00:1.

**Accent placement is rationed.** If indigo appears everywhere it stops meaning
"click this". Aim for one primary action per view. `--info` is deliberately a
neutral: it is on 58 call sites across the AI surfaces, and an accent on 58
elements is the background.

### Email surfaces do not follow the theme

`[data-surface="email"]` keeps the composer light in either theme. What is being
edited is an email; it lands in Gmail, on white, read by someone who has never
heard of this product's theme setting. A composer that does not resemble the
client it sends into makes every preview a guess.

The scope is deliberately small. Both preview panes are `<iframe sandbox="">`
with their own `srcDoc` styles and inherit nothing from `globals.css`, so only
the contentEditable composer needs it. The reply thread viewer is **not** in
scope: it renders plain text, so it is a conversation reader rather than a
rendering of an email, and it follows the theme like the rest of the chrome.

### Public marketing neutrals

The public page is theme-invariant: a visitor sees the same palette whether or
not a saved dashboard theme is in the browser. The `--marketing-*` ramp owns it
and must never resolve through an app token, because those move with the theme.

That is not hypothetical. Five landing tokens once read `--success`,
`--success-soft`, `--revenue`, `--revenue-soft` and `--danger` directly, and
the page served dark-mode status colours inside light-mode sections:
`--success-soft` resolved to a near-black green used as a background in eight
rules, one of which put body copy on it at 1.12:1.

`components/marketing/landing.module.css` must contain **no literal hex colours
and no non-neutral `rgb()`**. A hex-only ban once let roughly fifty literals
survive a migration inside shadows and gradients, and a later exemption for one
specific `rgb()` is how a two-generation-stale blue shipped on the nav.

## Shape, depth, motion

- **Radius**, assigned by what the element *is*, never by what looks right on
  the screen being built: `--radius-sm` 6px inline marks, `--radius-md` 10px
  controls, `--radius-lg` 14px cards and panels, `--radius-2xl` 28px dialogs and
  hero surfaces. `--radius-xl` 20px is held in reserve, because it is the value
  everything reached for when 182 call sites shared one corner.
- **Elevation**: four levels, `--shadow-sm` through `--shadow-xl`, plus
  `--shadow-brand` for the one control a thumb should land on. Light uses a 1px
  contact shadow and a wide ambient one. Dark cannot: a darker shadow on a dark
  field is invisible, so it uses `--edge-highlight`, a top highlight, and the
  surface step instead. Never put `none` inside a comma-separated shadow list;
  it invalidates the whole declaration.
- **Motion**: `--dur-fast` 140ms for hovers, `--dur-base` 220ms for most
  transitions, `--dur-slow` 420ms for entrances. Always `--ease-out`. Everything
  respects `prefers-reduced-motion`.
- **Nothing loops in peripheral vision.** Motion is allowed when it responds to
  the reader or reports something real. Motion must communicate entering,
  leaving, sending, replying, progress, selection or causality. It may not
  decorate a surface.

## The Cadence Line

The product's one visual signature, in `components/ui/CadenceLine.tsx`. Several
thin trajectories running through a system, diverging and rejoining: sequencing,
pacing, branching, replies coming back.

It is geometry rather than an illustration, which is why the same lines can be a
separator, a loading state, a progress bar and a campaign diagram. The geometry
is defined once in that file and shared by every variant. Nothing else in the
product draws parallel branching lines by hand, and a guard enforces that: two
motifs are none.

Only the loading variant animates, because a loading state is a claim that work
is happening.

Restraint is the point. Expensive reads as a few well-crafted moments plus calm
everywhere else, not as motion on every element.

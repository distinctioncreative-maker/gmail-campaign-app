# Redesign brief: make Cadence look like it costs money

Status: proposed, not started. This is the spec we execute from.

---

## 1. The diagnosis, from the code rather than from taste

"Square, coded in 2012" is an accurate read of a real, measurable condition.
Three findings, all verifiable in `app/globals.css`:

**The radius ladder tops out at 10px.**

```css
--radius-sm: 3px;  --radius-md: 5px;
--radius-lg: 8px;  --radius-xl: 10px;
```

These are re-exported into Tailwind through `@theme inline`, so `rounded-xl`
does not mean Tailwind's usual 12px here, it means **10px**. There are 180
`rounded-xl` and 99 `rounded-lg` in the codebase. Every panel in the product is
therefore an 8px rectangle. Robinhood, Linear, Mailchimp and Stripe all sit
between 12px and 28px. 8px is the Bootstrap 3 default, which is precisely the
era the app is reading as.

**Three of the four elevation tokens are literally `none`.**

```css
--shadow-sm: none;  --shadow-md: none;  --shadow-brand: none;
--shadow-lg: 0 8px 28px -18px rgba(15, 23, 41, 0.18);
```

And the shadow tokens are *not* mapped into `@theme inline`, so they are only
reachable from inside `globals.css`. `.card` uses none of them. Every card in
the product is a 1px border and nothing else. Nothing in the interface has ever
been above the page.

**`.card` is the whole visual identity, and it is three lines.**

```css
.card { background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius-lg); }
```

This was deliberate. The comment above it says a soft shadow "reads cheap" and a
hairline "reads considered." That instinct was right and the execution
overshot. Removing depth and roundness does not produce Linear. It produces a
1990s dialog box with better fonts.

**What actually makes an interface read as expensive** is not flatness. It is
*precision plus generosity*: large radii, shadows so soft they are never seen as
shadows but only as separation, a great deal of whitespace, one confident
accent, and a wide gap between the largest and smallest type on screen. Luxury
is sold by whitespace. We currently have 20px card padding and a 14px type
size for almost everything.

---

## 2. What we are aiming at

Reference feel, in priority order:

- **Robinhood** for the numbers. Enormous figure, tiny letterspaced label,
  green or red doing all the emotional work, nothing else on the card.
- **Linear** for the chrome. Precise, quiet, fast, with real depth used sparingly
  and keyboard affordance everywhere.
- **Mailchimp** for warmth. Personality in the empty states and the copy, so the
  product does not feel like an internal admin tool.
- **Stripe** for the marketing site. Depth, product imagery in frames, a type
  scale with real range.

The single sentence to design against: **it should look like the numbers on
screen are worth money.**

---

## 3. The four levers, ordered by impact per unit of work

### Lever 1: radius (biggest visible change, smallest diff)

| Token | Now | Proposed | Applies to |
|---|---|---|---|
| `--radius-sm` | 3px | 6px | badges, tiny chips |
| `--radius-md` | 5px | 10px | buttons, inputs, segmented controls |
| `--radius-lg` | 8px | **14px** | cards, panels, dialogs |
| `--radius-xl` | 10px | 20px | hero surfaces, modals, feature tiles |
| `--radius-2xl` | (unset) | 28px | marketing hero, image frames |

Because these flow through `@theme inline`, this single edit restyles all 180
`rounded-xl` and 99 `rounded-lg` call sites at once. Nested radii must follow the
rule *inner = outer minus padding*, or the corners fight.

### Lever 2: elevation (make the ladder real, and map it into Tailwind)

Replace the three `none` values with a ladder built on the principle that a
shadow should never be perceptible as a shadow:

```
--shadow-sm:  0 1px 2px rgba(15,23,41,.04)
--shadow-md:  0 1px 2px rgba(15,23,41,.04), 0 8px 24px -12px rgba(15,23,41,.10)
--shadow-lg:  0 1px 3px rgba(15,23,41,.05), 0 18px 48px -24px rgba(15,23,41,.16)
--shadow-xl:  0 2px 4px rgba(15,23,41,.06), 0 32px 80px -32px rgba(15,23,41,.22)
```

Large blur, large negative spread, low opacity, minimal offset. Then map them
into `@theme inline` so `shadow-md` in a component means our token instead of
Tailwind's default. Dark mode needs its own values: in dark, separation comes
from a lighter surface and a top highlight, not from a darker shadow.

Rule for usage: hairline **and** whisper of shadow on resting cards, one step up
on hover for anything clickable, two steps for popovers and dialogs. Nothing
else gets elevation.

### Lever 3: space (this is the actual luxury)

- Card padding `p-5` (20px) becomes `p-6 sm:p-7` (24 to 28px).
- Section stack `space-y-5` becomes `space-y-8`.
- Page top padding increases; page content max-width gets a deliberate measure
  rather than filling the viewport.
- Table rows get taller. Density is a spreadsheet quality, not a premium one.
- Dashboard KPI tiles get significantly more internal breathing room.

### Lever 4: typographic range

Right now nearly everything is 14px and headings are `font-medium`. There is
almost no scale contrast, which is the single most common reason a competent
layout still reads cheap.

- KPI figures: 36 to 48px, `--font-display`, tabular numerals, tight tracking.
- Section headings: up in size and weight, with real space beneath.
- Labels: 11px, uppercase, `letter-spacing: 0.06em`, muted.
- Body stays 14px. The range is what changes, not the baseline.

Keep Inter Tight for display. It is a good face and swapping it is a bigger
argument than this redesign needs.

---

## 4. Colour, which needs a decision from the founder

The current palette is disciplined and its contrast ratios are measured and
documented in comments. **That discipline survives the redesign, unconditionally.**

But `--background: #f1f4f8` is a cold blue-grey, and `--primary: #2354c7` is the
most common blue in B2B SaaS. Together they read "internal admin tool." Three
directions, each keeping the two-accent rule:

- **A. Warm paper.** Page moves to a warm near-white, borders warm slightly,
  blue accent stays. Lowest risk, reads immediately more premium, closest to
  Stripe and Mailchimp. **My recommendation.**
- **B. Dark-first.** The authenticated app defaults to dark, light becomes the
  option. This is the Robinhood move and the fastest route to "expensive," but
  it is the largest amount of work and every surface needs re-checking.
- **C. Deepen the existing cool palette.** Richer navy ink, more saturated
  accent, keep everything else. Smallest change, smallest payoff.

Whichever we pick, **the two-accent rule stays**: blue for clickable or the
product speaking, green for finished or working. A third hue is what made the
old palette noise, and that is documented.

---

## 5. Motion

Tokens already exist (`--ease-out`, `--dur-fast/base/slow`) and are barely used.
Add, all gated behind `prefers-reduced-motion`:

- KPI numbers count up on first paint.
- Page content rise on route change (`.animate-rise` exists, use it consistently).
- Row and card hover: border and background only, never lift or glow.
- Button press: a 1px translate, nothing more.
- Skeletons shimmer instead of sitting static.

Motion budget: nothing longer than 420ms, nothing that delays interaction.

---

## 6. Surface plan

**Phase 1: tokens.** Radius ladder, elevation ladder, map shadows into
`@theme inline`, spacing scale, type scale. Nothing else. This alone will
change every screen, and we look at it before going further.

**Phase 2: primitives.** `.card`, `.btn-*`, `.field-input`, `.badge`,
`.segmented`, `StatTile`, tables, dialogs, toasts. These cover most pixels.

**Phase 3: the app's five highest-traffic screens.** Home, Campaigns, Replies,
Leads, Reports. KPI treatment, table density, empty states with real personality.

**Phase 4: the website.** Hero with depth and a real product frame, proof strip,
bigger type, the spintax variation demo given the room it deserves, pricing
table rebuilt, legal pages made to look designed rather than dumped.

**Phase 5: the long tail.** Settings, admin, deliverability, owner portal,
onboarding, tour. Consistency sweep.

---

## 7. Constraints that do not move

1. **Contrast ratios stay measured and documented.** Every colour comment in
   `globals.css` records its ratio. New values get new measurements, in the same
   format. No estimating.
2. **The two-accent rule stays.**
3. **No em-dashes in user-facing copy.** Enforced by `tests/unit/copy-style.test.ts`.
4. **44px touch targets on mobile.** Enforced by `tests/unit/premium-design-system.test.ts`.
5. **Focus rings stay visible** on every interactive element, in both themes.
6. **Dark mode is not an afterthought.** Every token gets both values in the same
   commit, and no colour may be defined only inside a media query.
7. **The full gate on every phase:** `npx tsc --noEmit`, `npm run lint`,
   `npm test`, `npm run build`.

**Guard tests that will fight this, and must be updated deliberately rather than
deleted:** `landing-experience.test.ts` (pins the marketing radius ladder and
palette), `brand-palette.test.ts`, `palette-rank.test.ts`,
`premium-design-system.test.ts`. Each of these encodes a decision that was made
for a reason. Changing one means changing the reason too, in the same commit,
with the new reason written down.

---

## 8. How we will know it worked

Not "it looks better." Specific, checkable claims:

- A stranger shown the dashboard guesses a price above $50 a month.
- The largest and smallest type on any screen differ by at least 3x.
- No screen has a card with zero elevation next to one with elevation.
- Every KPI on Home is legible from across a desk.
- The landing page hero survives being viewed on a phone without the product
  frame becoming unreadable.
- Dark mode looks intentional rather than inverted.

---

## 9. Open questions for the founder

1. **Colour direction: A, B, or C from section 4?** This is the only decision
   that blocks Phase 1.
2. **Dark-first for the app, or light-first with dark available?**
3. **Do we have real product screenshots for the marketing site**, or does the
   hero keep using the live animated demos? The demos are genuinely a strength
   and I would not remove them, but a static hero frame usually converts better
   above the fold.
4. **How brave on the wordmark and logo?** Currently typographic only. In scope
   or out?
5. **Any brand assets, colours, or references you already like** that I should
   design toward rather than around?

# Cadence primary color options

Decision status: **founder choice required**. The current indigo-violet stays
in production until one option below is approved.

## Why a choice is needed

The warm neutral system sits between 32 and 36 degrees of hue. The current
primary, `#5b47e0`, is a highly saturated 248-degree indigo. That temperature
and saturation gap is why otherwise cohesive screens can still feel slightly
disconnected. The gold `--revenue` token remains `#b07d2e` in every option and
continues to be reserved for replies, interested leads, pipeline, and money.

## Candidates

| Option | Primary | Hover | Soft surface | Contrast on paper | Direction | Main tradeoff |
|---|---|---|---|---:|---|---|
| A: Warm terracotta | `#8f4e3c` | `#754033` | `#f7ece8` | 5.81:1 | Warm, confident, founder-led | Closest to the 36-degree revenue gold, so money moments need careful separation |
| B: Restrained plum | `#72506f` | `#5e405b` | `#f4edf3` | 6.24:1 | Premium and distinctive without electric SaaS indigo | Still a chromatic accent, though substantially calmer than the current violet |
| C: Warm blue-grey | `#4b5963` | `#3d4952` | `#eef1f2` | 6.64:1 | Quiet, editorial, closest to a Notion-like restraint | Least expressive and may make primary actions feel too conservative |

All three primary values exceed WCAG AA for normal text on both warm paper
and white surfaces. Each remains visually distinct from the fixed revenue
gold. Dark-theme lifted values and gradient endpoints must be tuned after the
light-theme choice rather than guessed in advance.

## Design recommendation

Option B, restrained plum, is the strongest balance. It preserves a memorable
Cadence action color, removes the electric default-SaaS feeling, and remains
clearly separate from revenue gold. Option C is the safest if the desired
direction is extremely quiet. Option A is strongest if warmth matters more
than strict separation from revenue moments.

## Implementation checklist after approval

1. Update `--primary`, `--primary-hover`, `--primary-soft`, `--brand-from`,
   `--brand-to`, `--accent`, and `--ring` in `app/globals.css`.
2. Tune the matching dark-theme primary, hover, soft, ring, and brand shadow.
3. Render the Home dashboard, account menu, a destructive confirmation, the
   landing hero, pricing, and a primary button in both themes.
4. Measure text, focus-ring, button, chart, and selected-navigation contrast.
5. Update `docs/brand.md`, this decision record, the feature registry, and the
   visual regression evidence in the handoff.
6. Run the complete quality gate before publishing.

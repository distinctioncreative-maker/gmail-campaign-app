# Cadence primary color options

Decision status: **option B selected on 2026-08-01**. Restrained plum is the
primary action color, supported by an editorial blue for AI and information.

## Why a choice is needed

The warm neutral system sits between 32 and 36 degrees of hue. The current
primary, `#5b47e0`, is a highly saturated 248-degree indigo. That temperature
and saturation gap is why otherwise cohesive screens can still feel slightly
disconnected. The revenue lane remains reserved for replies, interested leads,
pipeline, and money. Its implemented light value was darkened to `#99661c` on
2026-08-03 so normal-size text reaches AA contrast on warm paper.

## Candidates

| Option | Primary | Hover | Soft surface | Contrast on paper | Direction | Main tradeoff |
|---|---|---|---|---:|---|---|
| A: Warm terracotta | `#8f4e3c` | `#754033` | `#f7ece8` | 5.81:1 | Warm, confident, founder-led | Closest to the 36-degree revenue gold, so money moments need careful separation |
| B: Restrained plum | `#72506f` | `#5e405b` | `#f4edf3` | 6.24:1 | Premium and distinctive without electric SaaS indigo | Still a chromatic accent, though substantially calmer than the current violet |
| C: Warm blue-grey | `#4b5963` | `#3d4952` | `#eef1f2` | 6.64:1 | Quiet, editorial, closest to a Notion-like restraint | Least expressive and may make primary actions feel too conservative |

All three primary candidates exceed WCAG AA for normal text on both warm paper
and white surfaces. Each remains visually distinct from the fixed revenue
gold. The selected option's dark-theme values and plum-to-blue gradient were
tuned and measured as part of implementation.

## Selected system

Option B was selected with an explicit request to retain blue in the brand.
The implementation therefore uses two semantic lanes instead of turning every
control into a gradient:

| Role | Light | Dark | Contrast evidence |
|---|---|---|---|
| Plum primary | `#72506f` | `#c7a8c4` | 6.24:1 on paper; 8.36:1 on dark surface |
| Plum hover | `#5e405b` | `#d5b9d2` | 8.18:1 on paper; 9.95:1 on dark surface |
| Plum soft | `#f4edf3` | `#30242f` | Used only as a surface with matching foreground token |
| Editorial blue | `#456a8d` | `#8eb4d2` | 5.22:1 on paper; 8.17:1 on dark surface |
| Blue hover | `#355674` | `#a5c6df` | 7.06:1 on paper; 9.99:1 on dark surface |
| Blue soft | `#eaf1f7` | `#182634` | Used only as a surface with matching foreground token |

White text on the light plum and blue fills reaches 6.79:1 and 5.68:1.
Dark-theme fills use `--primary-contrast` and `--info-contrast`, reaching
8.25:1 and 8.05:1. The identity gradient runs from plum to blue and uses a
separate `--brand-contrast` token in each theme.

Plum owns calls to action, focus, active navigation, selected controls, and
primary chart data. Blue owns AI panels, informational badges, previously
contacted states, and system guidance. Revenue gold remains visually distinct
and reserved for replies, pipeline, and money; its final token uses the
contrast-corrected value documented above.

## Implementation record

1. Updated light and dark primary, information, contrast, gradient, ring,
   ambient-light, and shadow tokens in `app/globals.css`.
2. Replaced direct blue, purple, violet, and indigo utility classes with the
   semantic primary or information lane.
3. Moved AI writing, AI sequence, campaign personalization, informational
   status, and activity-chart accents onto the blue lane.
4. Added theme-safe foreground tokens for primary, information, and brand
   gradient fills.
5. Updated the landing hero atmosphere, Open Graph artwork, unsubscribe page,
   and starter email CTA to match the selected system.
6. Added automated contrast and source-consistency regression coverage.

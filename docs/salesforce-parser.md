# Salesforce Paste Parser

`lib/parser/salesforce.ts` parses lead lists copied straight out of a
Salesforce list view. Users paste; the app does the rest.

## Record shape

Records start with `Select Item N`. Fields follow one per line:

```text
Select Item 1
Jason Main                    ← full name        (free text #1)
Mainmastics Llc               ← business         (free text #2)
(469) 971-4333                ← phone            (pattern)
Central                       ← region           (free text #3)
14,000.00                     ← amount           (pattern, OPTIONAL)
alfredoheraldez@gmail.com     ← email            (pattern)
FalseEmail Opt Out            ← opt-out flag     (pattern)
Sunrise                       ← lead source      (free text #4)
1/20/2026, 8:04 AM            ← created          (pattern)
7/16/2026, 4:18 PM            ← updated          (pattern, OPTIONAL)
1521                          ← source ID        (pattern, OPTIONAL)
FalseNever Switched from NEW  ← flag             (pattern, OPTIONAL)
```

## How missing fields don't shift everything

Lines are **classified by pattern first** (phone, amount, email,
timestamp, boolean flags, numeric ID), not consumed by position. Only the
residual free-text lines are positional (name, business, region, lead
source, in that order). A record with no amount and no source ID — like
records 4–5 in the spec sample — still lands every other field correctly.

## Normalization before parsing

- `\r\n` → `\n`; non-breaking spaces → spaces
- Tabs → newlines (handles tab-separated cell copies)
- Common copied UI chrome lines (`Edit`, `Show Actions`, …) removed

## Output per record

`ParsedLead` (`schemas/parsedLead.ts`): every field nullable where the
source may omit it, plus:

- `warnings: string[]` — field-level, human-readable
- `confidence: 0–1` — deductions for missing/ambiguous fields
- `rawText` — original record text preserved for audit
- `emailValid` — RFC-shaped validation; invalid emails are flagged, never
  silently imported

## Safety rules enforced at import (server-side)

- Leads without a valid email are skipped.
- `TrueEmail Opt Out` leads are recorded with an `EMAIL_OPT_OUT`
  suppression so every later campaign stage excludes them.
- Previously contacted leads are pre-deselected in the preview UI and
  require explicit user opt-in.

## Tests

`tests/unit/salesforce-parser.test.ts` covers the ten required fixtures:
complete record, no amount, no source ID, extra tabs, extra blank lines,
invalid email, opt-out true, multiple records, unexpected extra line,
missing timestamp — plus the no-marker error path.

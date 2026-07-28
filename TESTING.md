# Testing

## Commands

```bash
npm test              # vitest unit suite (281 tests at this revision)
npm run test:emulator # Firestore rules isolation suite (needs Java)
npm run typecheck     # tsc --noEmit (strict)
npm run lint          # eslint
npm run build         # production build (Turbopack)
npm audit --omit=dev --audit-level=high # deployed dependency audit
```

## Unit coverage (`tests/unit/`)

- **Salesforce parser**: ten required fixtures (complete, no amount, no
  source ID, extra tabs, extra blank lines, invalid email, opt-out true,
  multiple records, unexpected extra line, missing timestamp) + no-marker
  path, against the verbatim spec sample.
- **CSV import**: header auto-detection, explicit mapping, opt-out
  parsing, invalid-email flagging, full-name splitting.
- **Normalization**: email casing/tags, phone country-code, business
  suffixes, name splitting.
- **Send safety**: test-mode destination override, `[TEST]` prefixing,
  server-verified self-test destination, fail-closed on missing config.
- **Token encryption boundary**: round-trip, fresh IV, tamper rejection,
  production refusal of the dev cipher.
- **Scheduling** (`window.test.ts`): 8 PM rollover, weekend rollover,
  daily-cap rollover, batch/spacing timestamps, business-day math,
  timezone day keys.
- **Eligibility**: every pre-send block reason incl. replay safety and
  idempotency; retryable vs terminal.
- **Personalization**: placeholder coverage, unresolved detection,
  HTML escaping, sanitized signature handling, fake-data previews.
- **HTML sanitization**: script/handler stripping, table/inline-style
  preservation, `javascript:` blocking, plain-text fallback.
- **Reply/bounce classification**: human/unsub/OOO/auto detection
  (header-first), hard/soft bounce codes, failed-recipient parsing.
- **Collision HMAC**: keyed, deterministic, not a plain hash, one-way.
- **Billing/tracking/tenancy**: Stripe multi-signature verification and
  timestamp rejection, current subscription seat quantity, purchased-seat
  enforcement, expiring tracking tokens, and plan-aware capability behavior.
- **Durable follow-up outbox**: deterministic next-step work and Cloud Tasks'
  supported scheduling horizon.
- **Campaign compliance**: initial and A/B templates cannot launch without
  physical-address and opt-out placeholders in the message body.

## Dependency audit scope

CI fails on any high-severity vulnerability in deployed dependencies using
`npm audit --omit=dev --audit-level=high`. Run the full `npm audit` too, but
interpret it separately: as of 2026-07-28 npm reports high-severity,
no-upstream-fix advisories in the pinned Firebase CLI and ESLint development
trees. Those packages are not included in the Cloud Run runtime image.
Dependabot remains enabled so patched development-tool versions are adopted
when available.

## Emulator coverage (`tests/emulator/isolation.test.ts`)

Six tests against `firestore.rules` in the Firestore emulator prove: a
user reads only their own data; cannot read another user's contacts or
campaigns; **Gmail connections are never client-readable even by the
owner**; all client writes are denied; unauthenticated reads are denied.
(This suite caught and fixed a real rules bug where a broad wildcard
OR-granted reads a separate deny block could not revoke.)

## Test-mode guarantee

No automated test sends real email. Every send path funnels through
`applySendSafety`, which forces campaign mail to
`TEST_EMAIL_DESTINATION` with a `[TEST]` subject while the organization is
in TEST mode.

## Recommended next

- Playwright e2e (sign-in mocked) for the wizard against the emulator.

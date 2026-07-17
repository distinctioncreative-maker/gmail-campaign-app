# Testing

## Commands

```bash
npm test              # vitest unit suite
npm run typecheck     # tsc --noEmit (strict)
npm run lint          # eslint
npm run build         # production build (Turbopack)
```

## Current automated coverage (37 tests)

- **Salesforce parser** (`tests/unit/salesforce-parser.test.ts`): the ten
  required fixtures — complete record, missing amount, missing source ID,
  extra tabs, extra blank lines, invalid email, opt-out true, multiple
  records, unexpected extra line, missing timestamp — plus the
  no-marker error path, all against the verbatim spec sample.
- **Normalization** (`normalize.test.ts`): email casing/tags, phone
  country-code, business suffixes, name splitting.
- **Send safety** (`send-safety.test.ts`): test-mode destination
  override, `[TEST]` prefixing, fail-closed behavior on missing config,
  literal-`false` opt-out semantics.
- **Token encryption boundary** (`kms-crypto.test.ts`): round-trip,
  fresh-IV, tamper rejection, production refusal of the dev cipher,
  fail-closed on missing config.

## Test-mode guarantee

No automated test sends email. `sendEmail` is never invoked by tests, and
even manual runs are governed by `TEST_MODE` (default on) which forces
all mail to `TEST_EMAIL_DESTINATION` with a `[TEST]` subject.

## Planned (later phases)

- Firebase Emulator Suite tests proving one salesperson cannot read
  another's documents under `firestore.rules`
- Playwright e2e for sign-in → paste → import → campaign wizard
- Idempotency/replay tests for the Cloud Tasks worker
- Schedule-window, business-day, and daily-cap rollover tests

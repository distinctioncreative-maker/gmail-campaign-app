# Campaign Safety

## The one gate every email passes through

`lib/gmail/safety.ts` → `applySendSafety(envelope)` is called inside
`sendEmail` immediately before the Gmail API request. There is no other
send path.

- `TEST_MODE` on (default): destination forced to
  `TEST_EMAIL_DESTINATION`, subject prefixed `[TEST]`. If no test
  destination is configured, sending **throws** rather than falling
  through.
- Only the literal string `TEST_MODE=false` disables the override —
  any other value (unset, "no", "0") keeps test mode on.

Unit-tested in `tests/unit/send-safety.test.ts`.

## Suppression layers (phase 2+)

Suppression is checked at import and will be re-checked at campaign
review, launch, before draft creation, and immediately before every
send/follow-up (phases 4–5). Sources: Salesforce Email Opt Out,
unsubscribe replies, hard bounces, manual entries, org-level entries,
invalid emails. Suppressions are never removed automatically.

## Idempotency (phase 4 design, locked in now)

Deterministic key per intended message:

```text
organizationId:userId:campaignId:recipientId:sequenceStep
```

Stored in a Firestore transaction **before** sending; a completed record
for the key permanently blocks a second send, so duplicate Cloud Tasks
delivery cannot duplicate an email.

## Pre-send re-checks (phase 4 worker contract)

Cloud Tasks cannot guarantee a task racing a cancellation won't fire, so
the worker re-verifies at execution time: campaign active, Gmail
connected, recipient included/not suppressed/not replied/not
bounced/not unsubscribed, queue item not complete, idempotency key
unused, inside send window, daily cap and quota reserve respected.

## Auto-pause triggers (phase 4–5)

Gmail revoked · repeated API failures · bounce-rate threshold ·
unsubscribe-rate threshold · template unavailable · duplicate-send risk
detected · suppression status unverifiable.

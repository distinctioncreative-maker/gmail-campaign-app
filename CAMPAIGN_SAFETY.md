# Campaign Safety

## The one gate every email passes through

`lib/gmail/safety.ts` → `applySendSafety(envelope)` is called inside both
`sendEmail` and `createEmailDraft` immediately before the Gmail API
request. There is no other delivery path.

- Org sending mode defaults to TEST: destination forced to
  `TEST_EMAIL_DESTINATION`, subject prefixed `[TEST]`. If no test
  destination is configured, sending **throws** rather than falling
  through.
- An explicit self-test may target only the email from the verified server
  session; campaign test traffic always uses the deployment destination.
- `FORCE_TEST_MODE=true` (and legacy `TEST_MODE=true`) locks the whole
  deployment to TEST even if an org admin requests LIVE.

Unit-tested in `tests/unit/send-safety.test.ts`.

## Suppression layers

Suppression is checked at import, campaign review, launch, draft creation,
and immediately before every send/follow-up. Sources: Salesforce Email Opt Out,
unsubscribe replies, hard bounces, manual entries, org-level entries,
invalid emails. Suppressions are never removed automatically.

Every non-test campaign message also includes RFC 8058 `List-Unsubscribe`
and `List-Unsubscribe-Post` headers backed by a signed, expiring token. A GET
request only shows a confirmation page because mailbox security scanners may
follow links automatically. A valid one-click POST atomically updates the
recipient, campaign counter, daily counter, and deterministic user
suppression, then cancels remaining queued work. Repeated POST requests are
idempotent.

## Launch, quota, and delivery idempotency

Deterministic key per intended message:

```text
organizationId:userId:campaignId:recipientId:sequenceStep
```

Campaign launch first transactionally moves DRAFT/READY to PREPARING and
writes deterministic queue IDs. Immediately before a real Gmail send, the
worker transactionally reserves both daily quota and the delivery key.
Any existing delivery reservation permanently blocks another Gmail call.
If the process fails after crossing the Gmail-call boundary, the item is
`AMBIGUOUS` and requires human review instead of automatic retry.

## Pre-send re-checks

Cloud Tasks cannot guarantee a task racing a cancellation won't fire, so
the worker re-verifies at execution time: campaign active, Gmail
connected, recipient included/not suppressed/not replied/not
bounced/not unsubscribed, queue item not complete, idempotency key
unused, inside send window, daily cap and quota reserve respected.

## Follow-ups and drafts

Pausing, canceling, resuming, and out-of-office deferral update both queue
documents and Cloud Tasks. A draft-only item uses Gmail Drafts, records
`DRAFTED`, consumes no send quota, and creates no follow-up.

The confirmed Gmail result and next follow-up queue record are committed in
one Firestore transaction. Cloud Task publication is a retryable projection:
if it fails, or if the intended time is beyond Cloud Tasks' 30-day maximum,
the durable queue item keeps `cloudTaskName: null` and the hourly repair sweep
publishes it once it is within Cadence's 29-day safety horizon.

Reply, unsubscribe, and bounce outcomes use the same transactional principle.
Only one concurrent mailbox scan may claim an outcome and increment its
campaign and daily counters.

## Auto-pause triggers

Gmail revoked · repeated API failures · bounce-rate threshold ·
unsubscribe-rate threshold · template unavailable · duplicate-send risk
detected · suppression status unverifiable.

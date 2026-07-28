# Data Model

Firestore, native mode. Timestamps are epoch milliseconds. Zod schemas in
`schemas/` are the single source of truth; repositories parse every read.

```text
organizations/{organizationId}                  — org profile + collision policy
organizations/{organizationId}/members/{userId} — role, active flag
organizations/{organizationId}/organizationSettings/main — sending, AI, billing policy
organizations/{organizationId}/suppressions/…   — org-scoped suppressions
organizations/{organizationId}/teamCollisionHashes/{hash}
organizations/{organizationId}/invites/{inviteId}

users/{userId}                                  — profile, role snapshot, onboarding
users/{userId}/gmailConnections/primary         — encrypted refresh token (server-only)
users/{userId}/contacts/{contactId}             — leads incl. campaign history fields
users/{userId}/imports/{importId}               — import audit record
users/{userId}/suppressions/{suppressionId}     — user-scoped suppressions
users/{userId}/templates/{templateId}
users/{userId}/sequences/{sequenceId}
users/{userId}/campaigns/{campaignId}
  …/recipients/{recipientId}
  …/events/{eventId}
  …/queue/{queueItemId}                         — durable task outbox, server-only
  …/messages/{messageId}                        — delivery reservation/result
users/{userId}/counters/{localDay}
  …/sendReservations/{idempotencyKey}

stripeEvents/{eventId}                          — webhook claim + expiresAt TTL
stripeCustomers/{customerId}                    — customer → organization pointer
rateLimits/{bucketAndFingerprint}               — fixed window + expiresAt TTL
```

## Isolation invariants

1. Owner is in the **document path** — a repository call cannot query
   another user's subtree without a different verified `AuthContext`.
2. `organizationId` + `ownerUserId` are stamped on every record from the
   session, never accepted from the client.
3. Sensitive collections (gmailConnections, queue) are excluded from
   client reads in `firestore.rules` regardless of owner.
4. A Gmail result, recipient status, current queue completion, campaign
   counter, and next follow-up queue record commit atomically.

## Key document shapes

See `schemas/*.ts` for authoritative field lists:

- `user.ts` — User, Member, Organization
- `gmailConnection.ts` — GmailConnection (+ Public variant without token)
- `contact.ts` — Contact, LeadClassification enum
- `suppression.ts` — Suppression (USER / ORGANIZATION scope)
- `parsedLead.ts` — pre-import parsed lead + warnings + confidence

## Dedup keys

- Primary: `normalizedEmail` (lowercased; dots/plus preserved — see
  `lib/parser/normalize.ts` for rationale)
- Secondary signals (warnings only): `normalizedPhone`,
  `normalizedBusinessName`, `sourceRecordId`

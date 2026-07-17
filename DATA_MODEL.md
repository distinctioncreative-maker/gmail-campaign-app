# Data Model

Firestore, native mode. Timestamps are epoch milliseconds. Zod schemas in
`schemas/` are the single source of truth; repositories parse every read.

```text
organizations/{organizationId}                  — org profile + collision policy
organizations/{organizationId}/members/{userId} — role, active flag
organizations/{organizationId}/suppressions/…   — org-scoped suppressions
organizations/{organizationId}/teamCollisionHashes/{hash}   (phase 6)

users/{userId}                                  — profile, role snapshot, onboarding
users/{userId}/gmailConnections/primary         — encrypted refresh token (server-only)
users/{userId}/contacts/{contactId}             — leads incl. campaign history fields
users/{userId}/imports/{importId}               — import audit record
users/{userId}/suppressions/{suppressionId}     — user-scoped suppressions
users/{userId}/templates/{templateId}           (phase 3)
users/{userId}/sequences/{sequenceId}           (phase 5)
users/{userId}/campaigns/{campaignId}           (phase 4)
  …/recipients/{recipientId}
  …/events/{eventId}
  …/queue/{queueItemId}                         — server-only
  …/messages/{messageId}
```

## Isolation invariants

1. Owner is in the **document path** — a repository call cannot query
   another user's subtree without a different verified `AuthContext`.
2. `organizationId` + `ownerUserId` are stamped on every record from the
   session, never accepted from the client.
3. Sensitive collections (gmailConnections, queue) are excluded from
   client reads in `firestore.rules` regardless of owner.

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

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
organizations/{organizationId}/webhookEndpoints/{endpointId} — subscription + signing secret
organizations/{organizationId}/webhookDeliveries/{deliveryId} — signed body, attempts, status

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
  - `organizationSettings/main.workspaceProfile` stores onboarding context:
    industry, team-size range, intended monthly outreach range, primary use
    case, and configuration time. It is guidance context only and never a send
    limit override.
  - `organizationSettings/main.customRoles` stores up to 20 reusable names,
    descriptions, and one audited base permission level each.
  - Member `customRoleId` and `roleLabel` select the display role while `role`
    remains the server authorization boundary. The user record mirrors the
    label for app chrome; authorization still re-checks membership.
  - Team `parentTeamId` forms an admin-managed hierarchy. Writes reject self
    parenting, missing parents, and ancestor cycles. Parent-team managers have
    tested descendant visibility and roster scope.
- `gmailConnection.ts` — GmailConnection (+ Public variant without token)
- `contact.ts` — Contact, LeadClassification enum
  - `listIds` stores reusable saved-list membership.
  - `tags` stores up to 20 normalized, owner-managed labels of 32 characters each.
  - `createdAt` is the authoritative Date added value shown in directories and
    lead detail. Directory pages order by `createdAt` and document ID for a
    stable cursor when multiple leads share a timestamp.
- `campaign.ts` — Campaign and recipient lifecycle
  - `archived` and `archivedAt` hide a retained campaign from the active view.
  - `deletedAt` moves a terminal campaign into Recently Deleted without
    removing its recipients, events, messages, or KPIs.
  - A campaign with `deletedAt` set is excluded from workspace and rep totals,
    reports, replies, and launch/control paths until restored. Permanent
    recursive deletion is a separate explicit action available only afterward.
  - Recipient `dealStatus` (MEETING_BOOKED / WON / LOST), `dealValueCents`,
    and `dealNote` record what a conversation became. Distinct from
    `replyIntent`, which is how the reply read; this is what the rep did about
    it, and it is only ever set by a human. `dealValueCents` is null when a
    win was recorded without a known amount, which is not the same as zero.
  - Recipient `meetingBookedAt` is sticky: set by either a booked meeting or a
    win, preserved through a later loss, and removed only by clearing the
    outcome. Without it the funnel could report fewer meetings than wins.
  - Campaign `meetingCount`, `wonCount`, `lostCount`, and `wonValueCents` are
    rollups maintained by a read-then-delta transaction
    (`lib/campaigns/outcomes.ts`). Never increment them on write: correcting a
    deal value or reversing a win has to unwind the prior contribution.
  - **Reading a counter added after a document was written returns undefined,
    not the schema default.** Sum counters through a coercing helper, as
    `sumTotals` and `loadHome` do. One undefined makes the total NaN, and a
    NaN width renders a progress bar full rather than empty.
- `suppression.ts` — Suppression (USER / ORGANIZATION scope)
- `parsedLead.ts` — pre-import parsed lead + warnings + confidence
- `integration.ts` — ApiKey, WebhookEndpoint, WebhookDelivery
  - An API key document's **id is the SHA-256 of the secret**, which makes
    verification a single point read. The secret is never stored. `ownerUserId`
    is separate from `createdByUserId`, because leads and campaigns live under
    `users/{userId}` and a key has to keep addressing that subtree after the
    person who created it leaves.
  - Webhook endpoints and deliveries are **subcollections of the organization**,
    unlike API keys: a webhook is only ever looked up in a workspace we already
    identified, and nesting means `recursiveDelete` during account deletion
    removes both without deletion knowing the feature exists.
  - A delivery stores the exact signed `body`. A retry must present identical
    bytes, since the signature covers `timestamp.body`. The delivery id is also
    the event id in that body, so a receiver deduplicating on it sees one event
    across every retry.

## Dedup keys

- Primary: `normalizedEmail` (lowercased; dots/plus preserved — see
  `lib/parser/normalize.ts` for rationale)
- Secondary signals (warnings only): `normalizedPhone`,
  `normalizedBusinessName`, `sourceRecordId`

## Lead pagination and import bounds

The lead directory has no application-wide total-contact ceiling. It reads
stable pages of 250 contacts and uses an opaque cursor made from `createdAt`
plus the document ID. List-scoped pages use the `listIds` array-contains index
with the same descending timestamp order. Imports are divided into bounded
200-row API requests and repository writes remain below Firestore batch limits;
these per-request bounds are operational safety controls, not storage or
account limits.

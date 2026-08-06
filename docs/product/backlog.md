# Audit and backlog

Every claim below was checked against source. Where something is missing, the
evidence is the absence of a symbol, and the grep that establishes it is named
so the next person can re-run it rather than trust this file.

Ordered by what changes the business, not by effort. Sizes are rough: **S** is
under a day, **M** is one to three days, **L** is a week or more.

---

## Where the product already stands

Worth stating, because the gaps below read worse without it. Verified present:

- Sending engine with Cloud Tasks, idempotency keys, ambiguous-delivery
  quarantine, per-recipient randomised spacing, send windows, daily caps.
- Suppression enforcement at import, at launch, and at final delivery.
- Reply and bounce detection, follow-up auto-stop, reply intent triage.
- Deal outcomes through to revenue reporting.
- Spread pacing, inbox warmup ramp, automatic bounce brake, address
  verification at import.
- SPF/DKIM/DMARC checks, Postmaster reputation, a ten-rule spam scorer that
  enforces physical address and opt-out.
- Teams, roles, custom role labels, per-rep scoping.
- Stripe checkout, portal, HMAC webhook verification, idempotent event
  claiming, plan flip. Complete code, no configuration.
- 435 tests, strict TypeScript, clean lint and build.

---

## 1. Functionality: what competitors have that we do not

### 1.1 Multi-inbox rotation — **L** — the ceiling on account value

**Missing.** `grep -rn "inboxRotation\|senderPool" lib app` returns nothing.
One user has one Gmail connection (`schemas/gmailConnection.ts`), and the
worker resolves it with `getConnection(ownerUserId)`.

**Why it decides pricing.** A single warmed inbox tops out near 150 a day.
That is the hard cap on what any customer can achieve, which caps what they
will pay. Every competitor at the $99+ tier sells volume through inbox count.
This is the single biggest revenue-limiting gap in the product.

**Plan.** Connection becomes one-to-many per user: `gmailConnections` keyed by
`connectionId` with a `primary` flag rather than one doc per user. A campaign
gains `senderConnectionIds`. The scheduler round-robins across healthy
connections and skips any that are disconnected, warming, or braked. Warmup
and the bounce brake become per-connection rather than per-campaign, which is
the correct scope for both anyway. Reporting gains a per-inbox breakdown so a
customer can see which sender is carrying the reputation.

**Risk.** Touches the send path, the warmup ramp, and the brake at once. Do it
behind a flag, keep single-inbox as the default path until the rotation path
has sent real volume.

### 1.2 Lead sourcing — **L** — the reason accounts go quiet

**Missing.** Registry has it as `planned`. Import is the only way leads enter.

**Why.** An activated customer who runs out of list stops using the product.
It is the most common cause of quiet churn in this category.

**Plan.** Do not build a data provider. Integrate one (Apollo, Clearbit, or
similar) behind an interface, so the vendor is swappable and the cost is
pass-through. Search by firmographics, preview, and import straight into a
lead list with the verification from 1.4 already applied. Charge for it
separately: it is a real marginal cost.

### 1.3 Spintax and message variation — **S** — cheap deliverability win

**Missing.** `lib/personalization/render.ts` substitutes `{{placeholders}}`
and nothing else.

**Why.** Five hundred byte-identical bodies is a fingerprint. Providers
cluster on message similarity, and variation is one of the few levers that is
free.

**Plan.** Extend the renderer with `{option one|option two}` syntax, chosen
per recipient from the existing seeded randomness. Show the variant count in
the template editor ("this produces 48 distinct bodies"). Add a spam-score
rule that warns when a template has no variation at all. Fits the existing
pure-renderer shape, so it is testable without a database.

### 1.4 Deeper verification — **S** — extends what just shipped

**Partial.** MX, typo, disposable, and role checks exist
(`lib/leads/verify.ts`). Catch-all domain detection and SMTP probing do not.

**Plan.** Add catch-all detection by probing a known-bad address at the
domain: a domain that accepts everything cannot confirm anything, and those
addresses deserve a "cannot verify" verdict rather than a clean one. Skip SMTP
probing entirely; it gets sending IPs blocklisted and is why the good vendors
stopped doing it.

### 1.5 API keys and webhooks — **M** — enterprise credibility

**Missing.** `grep -rn "apiKey\|webhookEndpoint"` returns nothing outside
Stripe.

**Why.** The first question a serious buyer asks. Also the cheapest CRM
integration story: give them events and let them wire it up.

**Plan.** Hashed API keys per workspace with scoped permissions, `Bearer` auth
reusing the route-guard sweep already in `tests/unit/apiGuards.test.ts`.
Outbound webhooks on reply received, bounce, unsubscribe, and deal outcome,
signed with the same HMAC helper the Stripe webhook verifier already uses.

### 1.6 Custom tracking domain — **M** — structural risk

**Missing.** `lib/tracking/inject.ts:32,36` builds every pixel and rewritten
link as `${APP_BASE_URL}/api/t/...`.

**Why.** Every customer shares one hostname in the body of every tracked
email. One customer sending genuine spam gets that domain flagged, and every
other customer's mail then contains a flagged domain. Fine at five customers,
dangerous at five hundred.

**Plan.** Per-workspace CNAME with verification, certificate provisioning, and
a Cloud Run domain mapping. The cheap mitigation shipped as 3.4 below: both
tracking settings default off, so most mail now carries neither the pixel nor a
rewritten link.

---

## 2. Security

Better than expected. Firestore rules are deny-by-default and correctly
exclude sensitive collections *inside* the wildcard condition rather than in a
separate deny block, with a comment showing whoever wrote it understood that
Firestore grants on any match. Tokens are KMS-encrypted. Header injection is
sanitised. Idempotency keys guard double sends.

### 2.1 Rate limiting covers 5 routes of 67 — **DONE**

**Verified.** `grep -rln "enforceRateLimit" app/api` returns only
`auth/session`, the two tracking endpoints, the unsubscribe route, and the
waitlist. Every authenticated route is unlimited.

**Why it matters.** `leads/import` accepts 5MB of CSV and does DNS lookups and
Firestore writes per row. A signed-in user, or stolen session, can drive
unbounded cost. AI routes have their own `aiRequestAllowed`, so the gap is
specifically the bulk data routes.

**Shipped.** Per-user ceilings on the six fan-out routes via
`lib/util/userRateLimit.ts`, mapped to a 429 with a specific message. A sweep
in `tests/unit/apiGuards.test.ts` fails if any of them loses its limiter.

### 2.2 No audit log — **M** — required for enterprise, useful for support

**Missing.** `grep -rn "auditLog\|AuditEntry"` returns nothing. Campaign
events exist but are campaign-scoped and describe sending, not administration.

**Why.** Who switched the workspace to live sending, who removed a member, who
exported data. First thing a security review asks for, and the thing that
answers "we did not do that" when a customer disputes.

**Plan.** Append-only `auditLog` subcollection per organization. Write on:
sending-mode change, member add/remove/role change, Gmail connect/disconnect,
data export, deletion, API key issue/revoke. Admin-visible, never editable,
retained on the schedule the legal work in the go-live checklist defines.

### 2.3 Session and token hardening — **S**

**Present:** HttpOnly session cookie, signed 10-minute OAuth state JWT bound
to the user, KMS-encrypted refresh tokens, revocation on disconnect.

**Gaps:** no session revocation list, so a stolen cookie stays valid to its
natural expiry; no visible "active sessions" surface.

**Plan.** A `tokenVersion` on the user, bumped on password-equivalent events
and on explicit "sign out everywhere". Cheap, and it makes the deletion work
in 4.2 actually terminal.

---

## 3. Deliverability, remaining

### 3.1 Reply-rate feedback into pacing — **M**

Positive engagement is the strongest inbox signal there is, and it is measured
but unused. A campaign replying at 12% has earned more volume than one at 1%.

**Plan.** Fold reply rate into the effective daily cap as a fourth term
alongside campaign limit, plan cap, and warmup, bounded so it can raise volume
by at most 50% and lower it by at most 50%. Same `Math.min` composition, one
more input.

### 3.2 Warmup anchored on first send, not connection date — **S**

Known simplification, recorded in `lib/campaigns/warmup.ts`. An inbox
connected a month ago and never used counts as warm.

**Plan.** Lifetime send counter per connection, incremented where
`reserveDailySend` already writes. One field, one write, removes the caveat.

### 3.3 Bounce brake per inbox — **S**, blocked on 1.1

Currently per campaign. The reputation being spent is the inbox's, so once
rotation lands the brake belongs there.

### 3.4 Open tracking defaults on — **DONE**

**Was.** One `trackingEnabled` flag defaulting `true`, so every cold email
carried a remote pixel *and* had every link rewritten, on a shared domain
(1.6), and a customer who wanted one had to accept the other.

**Shipped.** Two independent settings, `openTrackingEnabled` and
`clickTrackingEnabled`, both defaulting off, each stating its own tradeoff in
the wizard. `lib/tracking/settings.ts` resolves them, falling back to the old
flag for campaigns written before the split so nobody's running campaign
silently stops tracking. Injection gained the same split, and opt-out links
are now protected by their visible label as well as their address: a
hand-written "Unsubscribe" pointing at `/preferences` is no longer rewritten.

Mitigates 1.6 for most mail at zero engineering cost. Revisit the click
default once per-workspace tracking domains ship: the signal is worth having
once the reputation being spent is the customer's own.

---

## 4. Blockers on charging money

Unchanged from the go-live checklist. All code, none waiting on Stripe or
Google.

### 4.1 Support contact path — **S**

No `support@`, no route, no form. A customer whose campaign breaks has nowhere
to go. Plan: a contact route reusing the existing waitlist endpoint shape,
plus a real address in the help centre and the legal footer.

### 4.2 Account and workspace deletion — **M**

No `deleteAccount`, no `deleteOrg`. GDPR obligation. Plan: soft-delete with a
30-day grace, then a hard recursive purge reusing `purgeCampaign`'s recursion.
Must also revoke the Gmail grant with Google and destroy the KMS ciphertext.

### 4.3 Data export — **M**

Leads and reply history go in and cannot come out. Plan: a background job
writing a zip of CSVs to signed-URL storage, notified when ready. Reuse
`ExportCsvButton`'s existing serialisation for the per-entity shapes.

---

## 5. UI, UX, and how expensive it feels

### 5.1 No command palette or global search — **M** — the biggest feel gap

**Missing.** `grep -rni "cmdk\|command palette"` returns nothing, across 20
pages.

**Why.** It is the single clearest signal that separates software people pay a
lot for from software they tolerate. Also genuinely faster.

**Plan.** Cmd-K over campaigns, leads, templates, and sequences, plus actions
("new campaign", "pause all", "switch to dark"). Server-side search route with
a debounced client. Keyboard-first, mouse optional.

### 5.2 No saved views or filters — **M**

**Missing.** `grep -rn "savedView\|savedFilter"` returns nothing. Every visit
to Leads or Campaigns starts from the default filter.

**Plan.** Named filter sets per user, stored on user settings, surfaced as
tabs above the table.

### 5.3 First-run emptiness — **M**

No seeded template, no sample list, nothing. Fourteen steps from sign-in to a
sent email: seven onboarding, seven wizard.

**Plan.** Seed three starter templates on workspace creation. Collapse
onboarding to Gmail connect plus sender details, deferring the rest to the
checklist that already exists on Home. Target under three minutes to a real
test send.

### 5.4 Bulk actions — **present**, corrected

`components/leads/BulkLeadOrganizer.tsx` exists. An earlier note in this
session said otherwise and was wrong.

### 5.5 Smaller polish — **S** each

Keyboard shortcuts on the reply inbox (j/k, e to archive). Optimistic updates
beyond the outcome control. A real 404 and error boundary per route group.
Skeletons on the slowest three pages rather than a spinner.

---

## Suggested order

1. ~~**2.1 rate limiting**~~ — done.
2. ~~**3.4 tracking default**~~ — done.
3. **4.1–4.3 support, deletion, export** — the actual blockers on charging.
4. **5.1 command palette** — the feel gap, and it makes demos better.
5. **1.3 spintax** — S, deliverability, cheap.
6. **1.1 multi-inbox** — L, and the one that changes what you can charge.
7. **1.5 API and webhooks** — M, unlocks enterprise conversations.
8. Everything else as it earns priority.

Items 1 and 2 are shipped. They took under a day between them and removed the
two sharpest edges.

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

### 1.1 Multi-inbox rotation — **DONE**

**Was.** One connection per user at a fixed document id, resolved with
`getConnection(ownerUserId)`. A single warmed inbox tops out near 150 real
sends a day, so that was the hard ceiling on what any customer could achieve,
which made it the ceiling on what the product could charge.

**Shipped.** Connections are one-to-many. The existing document keeps its
`primary` id rather than being migrated, so every account that connected an
inbox before this keeps its connection, its token, and its warmup history and
simply becomes an account with one connection in a collection that allows
several.

Selection lives in `lib/sending/inboxPool.ts`, pure and covered by 43 tests,
because the rules decide which real mailbox a real email leaves from:

- **Least-used-today wins.** Filling one inbox to its ceiling before touching
  the next produces exactly the spiky per-address pattern rotation exists to
  avoid, and would make a three-inbox account behave like a one-inbox account
  until lunchtime. Ties break toward primary then by id, so a bug here is
  reproducible from a customer's report.
- **A threaded follow-up is pinned to the inbox that started the thread.** A
  follow-up from a different address is not a follow-up: the recipient sees a
  stranger replying inside their conversation and Gmail will not thread it. If
  that inbox cannot send, the follow-up waits. Switching mid-thread is not
  recoverable once the mail has gone.
- **A campaign that names its senders means it.** An unavailable chosen sender
  makes the campaign wait rather than quietly using an address the customer
  excluded.
- **Warmup and the bounce brake moved to the inbox**, which is the scope that
  was always correct for both: the reputation a bounce rate spends belongs to
  the sending address, so a bad list run from one inbox no longer brakes the
  others.

**Rotation is not a volume multiplier.** Connecting a third inbox does not
silently triple sending. The campaign limit and the plan cap still bound the
total; what rotation buys is the ability to *raise* that limit without any
single address exceeding a safe rate. Reservation is two-level and both are
required: the campaign counter enforces what the customer asked for, the
per-inbox counter enforces what a mailbox may safely send.

**Also closed 3.2 and 3.3 on the way.** The warmup ramp now uses lifetime sends
as well as connection age, so an inbox connected five weeks ago and never used
is no longer treated as warm; and the brake is per inbox, which was blocked on
this item.

**Reporting** gained a per-inbox breakdown. A pooled 3% bounce rate can be
three healthy inboxes or two clean ones and one on fire, and those call for
completely different actions.

### 1.2 Lead sourcing — **L** — the reason accounts go quiet

**Missing.** Registry has it as `planned`. Import is the only way leads enter.

**Why.** An activated customer who runs out of list stops using the product.
It is the most common cause of quiet churn in this category.

**Plan.** Do not build a data provider. Integrate one (Apollo, Clearbit, or
similar) behind an interface, so the vendor is swappable and the cost is
pass-through. Search by firmographics, preview, and import straight into a
lead list with the verification from 1.4 already applied. Charge for it
separately: it is a real marginal cost.

### 1.3 Spintax and message variation — **DONE**

**Was.** `lib/personalization/render.ts` substituted `{{placeholders}}` and
nothing else, so every recipient got a byte-identical body.

**Shipped.** `{option one|option two}` chosen per recipient, with nesting. The
template editor shows the live variant count, and the spam scorer warns when a
template has no variation and when its syntax is malformed.

Three decisions worth recording:

- **It parses rather than regexes.** A single regex looks adequate until
  someone nests, and then `{Hi {there|friend}|Hello}` produces mangled output
  instead of an error. Silently corrupting an email is worse than refusing it.
- **`{{placeholder}}` is not spintax**, and the two syntaxes share a brace.
  A parser that did not know the difference would read `{{first_name}}` as a
  group with one option and strip a brace from every placeholder in the
  product. Double braces are recognised and skipped whole. This one bit twice:
  the first `hasSpintax` fast path used a brace-free window to find the pipe,
  so a placeholder inside an option hid it and the template shipped unexpanded.
  A test caught it.
- **Expansion runs before substitution**, never after. A lead whose company is
  literally `Foo {Bar|Baz}` is data, and the other order would let a contact's
  own field decide what the email says.

The choice is seeded from recipient plus step rather than random, so a retry
after an ambiguous delivery sends the byte-identical email instead of a second,
differently worded one, and the preview matches what goes out.

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

### 3.2 Warmup anchored on first send, not connection date — **DONE**

Known simplification, recorded in `lib/campaigns/warmup.ts`. An inbox
connected a month ago and never used counts as warm.

**Plan.** Lifetime send counter per connection, incremented where
`reserveDailySend` already writes. One field, one write, removes the caveat.

### 3.3 Bounce brake per inbox — **DONE**

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

### 4.1 Support contact path — **DONE**

**Was.** No `support@`, no route, no form. A customer whose campaign broke had
nowhere to go.

**Shipped.** Two paths, because they fail at different moments. `/help/contact`
is the in-app form: it asks for a category, a subject, and what happened, and
attaches workspace, plan, sending mode, Gmail connection status, and the Cloud
Run revision server-side, so most of the usual first round trip is skipped. No
lead data and nothing from the mailbox goes with it. `/support` is public and
carries a plain address, because someone who cannot sign in cannot use an
authenticated form, and that is exactly when they most need to reach a human.

Requests land in a server-only `supportRequests` collection with a
`CDN-XXXXXX` reference the customer can quote back, built on an alphabet with
no I, L, O, or U so a reference read down a phone stays the same reference.
Rate limited at 10 an hour per user. `SUPPORT_WEBHOOK_URL` optionally pings a
chat channel.

**Remaining, configuration not code:** set `SUPPORT_EMAIL` on the Cloud Run
service. Until then `/support` says no address is published yet rather than
rendering a mailto that goes nowhere.

### 4.2 Account and workspace deletion — **DONE**

**Was.** No `deleteAccount`, no `deleteOrg`. A GDPR obligation, and the one
most likely to arrive as a complaint rather than a feature request.

**Shipped.** Soft first, hard later: a request starts a 30-day clock, the
account works normally throughout, and the sweep (`?job=deletions`, daily at
03:00) purges once the period has fully elapsed. Scope is ACCOUNT or
WORKSPACE, and a one-person workspace collapses the two, because deleting the
only member while keeping the org would leave an empty organization behind.
Deleting the last admin of a workspace that still has members is refused, with
the two ways out named: promote someone, or delete the workspace.

Two things the recursive delete alone would have missed, and both are the
whole point of the feature:

- **The Google grant.** Deleting the encrypted token removes our copy but
  leaves Cadence sitting in the customer's Google account with mailbox access
  they believe they revoked. Revocation runs first, before the token is
  destroyed, and the outcome is recorded on the request.
- **The Firebase Auth identity**, which is not ours to delete. Without a
  tombstone, `requireUser` provisions a fresh user document for any
  authenticated identity it does not recognise, so the next sign-in would
  silently rebuild the account that was just deleted. `deletedIdentities`
  blocks sign-in while a purge is in flight and, once complete, lets a
  genuinely new signup through with none of the old data: a deletion request
  is not a permanent ban.

### 4.3 Data export — **DONE**

**Was.** Leads and reply history went in and could not come out.

**Shipped.** Six CSV datasets plus a settings snapshot, from Settings: leads,
campaigns, sending history, do-not-email, templates, and follow-ups. Each
streams from a cursored Firestore read, so a workspace with a few hundred
thousand recipient rows does not get assembled in memory on a Cloud Run
instance before the first byte moves.

**Deliberately not the plan above.** The original sketch was a background job
writing a zip to signed-URL storage. That needs a bucket, a lifecycle policy,
signed URLs, a notification, and a new dependency, and it leaves a complete
copy of the customer's personal data sitting in storage. That copy would then
need its own retention schedule and its own purge path in 4.2, and a bug in
either would leave someone's lead list in a bucket after they were told
everything was deleted. Streaming the response produces the same file, in one
click instead of an unknown number of minutes, and creates no second copy to
govern.

**The part worth knowing about:** exported values are guarded against formula
injection. A lead whose company name is `=HYPERLINK("http://evil","Click")`
was typed by whoever filled in a form, travelled through import untouched, and
executes when the customer opens the file. Quoting does not fix it, because
spreadsheets evaluate a leading `=` inside quotes too. Values are prefixed
rather than stripped, so `-50` stays `-50` instead of quietly becoming `50`.

---

## 5. UI, UX, and how expensive it feels

### 5.1 No command palette or global search — **DONE**

**Was.** Nothing, across 20 pages. The clearest single signal separating
software people pay a lot for from software they tolerate.

**Shipped.** Cmd-K (Ctrl-K) over campaigns, leads, templates, and follow-ups,
plus commands and page navigation. No palette dependency: the whole feature is
a filtered list and a keydown handler.

The ranking is the part that took the thinking, because a palette lives or
dies on its first result. Exact beats whole-string prefix beats word prefix
beats substring; word boundaries include the separators real names use
(`acme-corp`, `welcome_email`, `sales/EU`); a hit in secondary text never
outranks one in the name; multi-term queries match terms that are all present
but not adjacent, which is how people type when they half-remember something.
Recency only breaks ties, so the three most recently touched campaigns cannot
bury an exact name match on an older one.

Commands carry search keywords, so `csv`, `upload`, `dkim`, `unsubscribe`, and
`gdpr` all land on the right screen without anyone learning our vocabulary.
Nothing gated by role or plan is ever offered.

**One honest limit.** Campaigns, templates, and follow-ups are bounded and are
ranked in memory, so they get true substring matching. Leads cannot be: a
workspace holds tens of thousands, so those use Firestore prefix queries and
match the *start* of an email or company name. That is stated in the palette
rather than left to be discovered. Real substring search over a collection that
size needs a search index; loading five thousand documents per keystroke to
fake one would be worse than the stated limit.

### 5.2 No saved views or filters — **M**

**Missing.** `grep -rn "savedView\|savedFilter"` returns nothing. Every visit
to Leads or Campaigns starts from the default filter.

**Plan.** Named filter sets per user, stored on user settings, surfaced as
tabs above the table.

### 5.3 First-run emptiness — **DONE**

**Was.** No seeded template, no sample list, nothing. Fourteen steps from
sign-in to a sent email: seven onboarding, seven wizard.

**Shipped.** Onboarding is five steps, not seven. Two of the removed ones were
not features:

- "Your details" and "Sending defaults" both rendered the same `ProfileForm`,
  once compact and once full, so the second step asked a user to look again at
  a form they had just filled in. They are one step.
- The test send was a gate between a new user and a working app. It is offered
  on the final step and the first-win checklist on Home asks again, so nobody
  is held up and nobody forgets.

Three starter templates are seeded per user: two universal, one matched to the
workflow they picked in the workspace step, which the step already collected.
Each one carries `{{unsubscribe_text}}` and `{{physical_address}}` so it passes
the product's own launch check, uses spintax so the first template anyone opens
demonstrates variation, and scores an A on the spam checker. All four
properties are asserted in tests, because a starter that fails the product's
own checks teaches a new user on day one that the product is broken.

Seeding is guarded twice. `startersSeededAt` on the user means someone who
deletes the starters keeps them deleted; the empty-template-list check means an
established account is never handed three templates it did not ask for, which
is what the Zod default alone would have done to every existing user. It is
also seeded from the generic onboarding advance, not only the workspace step,
because an invited member never sees that step and templates are per-user.

**Not done:** no sample lead list. Seeding fake contacts into a real workspace
risks someone launching a campaign at them, and the CSV import path is already
short. The empty state points at import instead.

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
3. ~~**4.1–4.3 support, deletion, export**~~ — done. The three blockers on
   charging money are code-complete; what remains is configuration, tracked in
   the go-live checklist.
4. ~~**5.1 command palette**~~ — done.
5. ~~**1.3 spintax**~~ — done.
6. ~~**1.1 multi-inbox**~~ — done. Also closed 3.2 and 3.3.
7. **1.5 API and webhooks** — M, unlocks enterprise conversations.
8. Everything else as it earns priority.

Items 1 and 2 are shipped. They took under a day between them and removed the
two sharpest edges.

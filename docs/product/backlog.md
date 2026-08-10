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

### 1.4 Deeper verification — **DONE, with the catch-all part reframed**

**Was.** MX, typo, disposable, and role checks existed. Catch-all detection did
not.

**The plan contradicted itself, and it is worth recording why.** It asked for
catch-all detection "by probing a known-bad address at the domain", then said in
the next paragraph to skip SMTP probing because it gets sending IPs blocklisted.
Those are the same technique. Learning that a domain accepts every address means
opening an SMTP conversation with its mail server and offering it one that cannot
exist, and there is no DNS record for it. The route is unavailable regardless:
Google Cloud blocks outbound port 25 from Cloud Run.

**So what shipped is the more valuable half of the idea: the verifier stopped
overclaiming.** An address whose domain merely had an MX record used to come back
**"Verified"**, and for most business domains that word was wrong. Google
Workspace and Microsoft 365 accept at SMTP time and decide about the mailbox
afterwards, so "the domain has a mail server" was the entire content of that
verdict.

- The same DNS lookup now returns the exchanger hostnames, so it also answers
  *who runs the mail for this domain* at no extra cost.
- A domain behind a **forwarding service** gets a new `UNCONFIRMABLE` verdict,
  shown as "Cannot confirm": those accept every address by design, so nothing
  short of sending will ever confirm one. Presented neutrally rather than as a
  warning, and still importable, because most business addresses are in this
  position and defaulting them out would break an ordinary import.
- A **personal mailbox** on a business list is flagged, and so is a domain behind
  a **filtering gateway**, where mail is likelier to be dropped silently than
  bounced and a missing reply is not evidence it arrived.
- **Workspace and 365 are deliberately not called catch-alls.** Either can be
  configured that way and usually is not, and a warning that applies to most
  addresses on earth is one people learn to ignore.
- The clean badge now reads **"Checked"** rather than "Verified". Overstating it
  made the honest tier beside it look like a downgrade.

A real problem at the address still outranks an unconfirmable domain: a role
inbox at a forwarding domain is first and foremost a role inbox.

### 1.5 API keys and webhooks — **DONE**

**Was.** Nothing outside Stripe. The first question a serious buyer asks.

**API keys: shipped and working.** Hashed keys per workspace with scoped
permissions, `Bearer` auth, admin-only management in Settings, and a real
versioned endpoint at `/api/v1/leads` (list and create) so the keys open
something rather than existing for their own sake.

Decisions worth recording:

- **The raw key is never stored, only its SHA-256.** A database dump or a stray
  log line can then never yield a working credential. The cost is that a key is
  shown exactly once, which the UI is built around rather than working around.
- **The document id is the hash.** Verification is a single point read, so there
  is no candidate scanning and no way for the number of comparisons to depend on
  how much of a guessed key was right.
- **Write does not imply read.** A customer handing an integration
  `leads:write` to push contacts in has not agreed to let it read the whole
  list back out, and bundling them would make the narrow grant inexpressible.
- **A key carries an owner, not just an organization.** This was a bug I wrote
  and caught: leads live under `users/{userId}`, so scoping by organization id
  addressed a document that does not exist and would have written API-created
  leads into a subtree the app never reads. The owner is stored separately from
  the creator so a workspace can reassign the integration when that person
  leaves.
- **`/api/v1/` is a separate namespace** from `/api/`. The latter is the app
  talking to itself and may change with the UI; the former is a promise to
  someone else's code.
- The route-guard sweep in `tests/unit/apiGuards.test.ts` gained a check that
  every `/api/v1` route calls `requireApiKey`, because exempting them from the
  session sweep would otherwise let one ship with no authentication at all.

**Webhooks: shipped.** An admin subscribes a URL to any of four events
(`reply.received`, `email.bounced`, `contact.unsubscribed`, `deal.updated`),
Cadence posts a signed JSON envelope when one happens, and the Settings card
shows what came back. Emission is wired at the reply and bounce sweeps, both
unsubscribe paths, and the deal-outcome route; delivery runs in a Cloud Tasks
worker at `/api/tasks/webhook-delivery`.

Decisions worth recording:

- **The URL is the dangerous input.** An outbound webhook is a request our
  server makes to an address the customer chooses, which is textbook
  server-side request forgery: on Google Cloud the prize is
  `169.254.169.254`, whose response contains service-account access tokens.
  `lib/webhooks/target.ts` refuses IP literals in every notation, because
  blocking the dotted form while allowing `0xa9fea9fe` or `2852039166` would be
  theatre. Three things narrow the rest: **redirects are never followed**, since
  a `Location` header would otherwise let a subscription aim the server anywhere
  and make the validation decorative; **the response body is never read, stored,
  or shown**, because request forgery is only fully useful when the attacker can
  see what came back; and every request is bounded at ten seconds. DNS rebinding
  remains possible in principle and is documented rather than pretended away.
- **Emission happens after the state it describes is committed.** A receiver
  that mirrors opt-outs must not be told about one we then failed to record.
- **Emission never throws and never waits for the receiver.** It writes a
  delivery and queues a task. A misconfigured endpoint cannot fail a reply
  sweep, and a slow one cannot slow it down.
- **The signed bytes are stored with the delivery.** The signature covers
  `timestamp.body`, so a retry has to present an identical body. The delivery id
  is also the event id inside it, which is what lets a receiver deduplicate
  across retries and across an at-least-once queue redelivery.
- **The worker answers 200 for a delivery that ran and failed, 500 for one that
  could not run.** Retrying a failed delivery is our decision, made in
  `lib/webhooks/retry.ts`; letting Cloud Tasks also retry would compound the two
  schedules into far more requests at a struggling endpoint than either intended.
  A delivery that never recorded an attempt is the opposite case and does need
  the queue, or it would sit in `RETRYING` with nothing behind it.
- **A test delivery exists and says it is a test.** Otherwise the first delivery
  a customer ever receives is a real event, and a verification bug loses it.
- **A dead subscription turns itself off**: immediately on `410 Gone`, and after
  twenty consecutive failures. High on purpose, because turning off a working
  customer's webhook is worse than a few more days of failed attempts.
- Subscriptions and deliveries are **subcollections of the organization**, unlike
  API keys, so `recursiveDelete` during account deletion removes them without
  deletion knowing this feature exists.
- The guard sweep gained two checks: every route that stores an endpoint calls
  `validateWebhookTarget`, and every `/api/webhooks` route is admin-only.

Not verified: no delivery has been made to a real external endpoint. The signing
scheme is proven against its own verifier in tests, and `postDelivery` is tested
with an injected fetch, but nothing here has posted to another company's server.

### 1.6 Custom tracking domain — **DONE (code)**

**Was.** Every pixel and rewritten link was built as `${APP_BASE_URL}/api/t/...`,
so every customer shared one hostname in the body of every tracked email. One
customer sending genuine spam gets that hostname flagged and every other
customer's mail then contains a flagged domain. Defaulting tracking off (3.4)
shrank how much mail was exposed; it never removed the exposure, and multi-inbox
rotation (1.1) raised the volume flowing through it.

**Shipped.** A workspace sets a subdomain it controls, points a CNAME at the
deployment, and verifies it. Tracked links then carry that hostname, so the
links spend the customer's own reputation.

Decisions worth recording:

- **Only a VERIFIED domain is ever used.** An unverified one would put a
  hostname in real mail that does not resolve, breaking every link in the send,
  which is strictly worse than the shared-domain risk it was meant to avoid.
- **A failed DNS lookup reports PENDING, never FAILED.** Propagation takes
  minutes to hours, and telling a customer their correct record is broken sends
  them to change something that was already right.
- **Unsubscribe links deliberately stay on the platform host.** An opt-out is
  legally required to keep working for as long as the mail exists, and a
  customer who later removes their CNAME would break every one already
  delivered. A broken opt-out is a compliance failure; a tracked link on a
  shared domain is a reputation cost. The inconsistency is intentional and
  commented at the call site so nobody "fixes" it.
- **The apex is refused.** Pointing the registrable domain at us would take
  over the customer's website.
- **`normalizeTrackingDomain` is a security boundary**, not a convenience: its
  output is interpolated into a URL that goes into real email, so a value
  carrying an @, a colon, a slash, or a newline is refused rather than cleaned
  up. Raw unicode is refused too, since two different-looking strings can
  normalize to the same host, which is what a homograph attack relies on.
- **The Host header is cross-checked against the token's organization.** The
  signed token already names the workspace, so routing never needed the header;
  the check exists so one customer's verified hostname cannot serve another
  customer's links, which would leak "this recipient opened" across a tenant
  boundary. The verified-domain list is cached for a minute, because the pixel
  and click endpoints are hit by mail clients rather than people and a
  collection-group query per pixel load would scale with recipients.

**Remaining, and it is infrastructure not code:** Cloud Run needs to accept the
customer hostnames. A domain mapping per customer domain does not scale, so this
wants a wildcard mapping (or a load balancer in front) before the first customer
verifies one. Tracked in the go-live checklist. Until that exists, verification
will succeed and links will still not resolve, so treat the feature as
code-complete rather than live.

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

### 2.2 Audit log — **DONE**

**Was.** `grep -rn "auditLog\|AuditEntry"` returned nothing. Campaign events
existed but they are campaign-scoped and describe sending, not administration.
Nobody could answer who switched the workspace to live sending, who removed a
member, or who exported the lead list.

**Shipped.** An append-only `auditLog` subcollection per organization, twenty-one
actions across sending policy, access, mailboxes, credentials, data, and
workspace identity, with an admin-only page at `/admin/audit`.

Decisions worth recording:

- **The action list is a closed enum, not a free string.** An open one drifts
  into three spellings of the same event within a month, and a log that cannot be
  filtered reliably is a log nobody reads. A test asserts the catalog in
  `lib/audit/actions.ts` and the schema enum have not drifted apart, and that
  every action has a label, a category, and a weight.
- **Actor email is snapshotted at write time.** The whole point of an entry is to
  survive the thing it describes, and a removed member leaves no document to
  resolve an id against. An entry reading `u_9fA2...` answers nobody's question.
- **Details are scalars only.** An audit log that accumulates payloads becomes a
  second copy of exactly the data deletion exists to destroy.
- **Written after the action succeeds, and never allowed to fail it.** The
  stricter discipline, refusing the action when it cannot be audited, is right for
  a bank and wrong here: a Firestore blip would stop an admin turning off live
  sending. So an entry can be missing when the write failed, that failure goes to
  the error sink, and what cannot happen is an entry describing something that did
  not occur. The trade is stated in the module rather than left implicit.
- **API keys and webhooks were the two most valuable additions.** Each is
  standing access to the workspace's data from outside it, and unlike a member
  neither appears on the Team page, so without the log there was no surface
  anywhere that said one had ever been issued.
- **Nothing can write history.** No update, no delete, the read route is GET-only
  and admin-only, and a sweep asserts no route touches the collection directly.
  The only thing that removes entries is the workspace purge, because a record of
  a workspace we promised to destroy is still a record.

An unknown action renders as NOTABLE rather than ROUTINE. A stored entry could
name an action from another deployment, and quietly presenting the unknown as
unimportant is the wrong way round for a security log.

### 2.3 Session and token hardening — **DONE**

**Was.** HttpOnly session cookie, signed 10-minute OAuth state JWT bound to the
user, KMS-encrypted refresh tokens, revocation on Gmail disconnect. The gap was a
five-day cookie nobody could end early: clearing it in one browser does nothing
to a copy on a laptop you no longer control.

**Shipped, and deliberately not the way this file planned it.** The plan called
for a `tokenVersion` on the user document. Building it would have added a
Firestore read to the authentication path of every request in order to
reimplement a check that already runs: `lib/auth/session.ts` calls
`verifySessionCookie(cookie, true)`, and that second argument is `checkRevoked`,
which validates the cookie against the account's `tokensValidAfterTime` in
Firebase Auth. Revocation was already enforced on every single request. The only
thing missing was anything that ever set the timestamp.

So `revokeAllSessions` calls `revokeRefreshTokens`, every cookie issued earlier
stops verifying immediately, no per-request cost is added, and there is no second
source of truth to drift. A test asserts that `true` is still there, because
without it the mechanism silently becomes decorative and nothing else in the suite
would fail.

- **Signing out ends the caller's own session too.** Sparing the current browser
  would leave the most recently used session alive, which is backwards if the
  reason for pressing the button is a device that is no longer yours.
- **`sessionsRevokedAt` is display metadata and nothing authorises against it.**
  A test asserts `requireUser` and `session.ts` never read it: this is the eighth
  time a Zod default on a field added after documents exist has needed thinking
  about, and here the default is only safe because no access decision consults it.
- **The purge revokes; scheduling a deletion does not.** Without revocation at
  purge, a cookie issued beforehand still verifies for five days and `requireUser`
  would clear the tombstone and provision a fresh account with nobody signing in
  again. Revoking at *request* time would be worse than useless: the grace period
  exists for changing your mind, and signing someone out the moment they schedule
  a deletion makes cancelling harder than requesting.
- **There is no device list, and the card says so.** Firebase does not expose the
  session cookies it has issued, so any list would be invented, and someone would
  read "1 active session" and conclude the copy they are worried about is not
  there. All or nothing, stated plainly, is the honest interface.

---

## 3. Deliverability, remaining

### 3.1 Reply-rate feedback into pacing — **DONE, lowering only**

**Was.** Positive engagement is the strongest inbox signal there is, and it was
measured on two pages and used for nothing.

**Shipped** as a fourth term in the same lowest-wins composition beside the
campaign limit, the plan cap, and inbox warmup. At or below 0.5% a campaign runs
at half its daily limit, below 2% at three quarters, and at ordinary
cold-outreach rates it is untouched.

**The 50% raise in the plan was not built, on purpose.** Every other term in that
`Math.min` is a ceiling, and the customer's chosen daily limit is the amount of
mail they authorised. A product that sends 120 when someone typed 80 has taken a
decision that was never offered to it, and unlike a wrong number on a screen the
mistake arrives in strangers' inboxes. It is the same reasoning that keeps
multi-inbox rotation from multiplying a campaign's limit.

The reward half still ships, as an offer rather than an action: a campaign
replying above 8% is told on its own page that it has earned a higher limit,
capped so the product never proposes a number its own pace checks would then warn
about. A person decides.

Two details that matter more than the thresholds:

- **The sixty-send sample floor.** A reply can arrive days after a send, so an
  early zero means only that it is early. Throttling a campaign on its first
  morning would be wrong, and hard to explain to whoever is watching it.
- **Nothing is silent.** A throttled campaign would otherwise present as "daily
  limit reached" at a number lower than the one the customer set, with nothing
  anywhere accounting for the difference. The campaign page and the diagnose
  panel both say what happened and why. It also never paces to zero: a campaign
  stopped that way is indistinguishable from a broken one, and stopping belongs
  to the bounce brake or to a person.

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
7. ~~**1.5 API and webhooks**~~ — done. Keys, the versioned endpoint, emission,
   the delivery worker, and subscription management all ship.
8. ~~**1.6 custom tracking domain**~~ — code done; needs a wildcard domain mapping.
9. ~~**2.2 audit log**~~ and ~~**2.3 session hardening**~~ — done together. The
   audit log had more to record after 1.5 than before it: a key and a webhook are
   both standing external access that appears on no other surface.
10. ~~**3.1 reply rate into pacing**~~ and ~~**1.4 deeper verification**~~ — done
    together. Both turned out to be about not overclaiming: one refuses to send
    more mail than was authorised, the other refuses to call an address verified
    when nothing verified it.
11. Everything remaining, in the order it earns priority: **5.2 saved views**,
    **5.5 polish**, then **1.2 lead sourcing**, the largest piece left on the
    board.

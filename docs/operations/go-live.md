# Go-live checklist

One ordered list from "closed allowlist" to "taking money from strangers."

Ordering matters. Item 1 has a multi-week external review that nothing else
depends on, so it starts first and runs in the background while the rest is
done. Nothing below is a code change unless it says so.

Status legend: **[ext]** waits on someone outside the team, **[cfg]** is a
console or dashboard change, **[code]** is unbuilt work.

---

## 0. Before anything: what already works

Verified in source, so it does not need re-litigating:

- Stripe Checkout, the billing portal, HMAC webhook verification with a
  five-minute replay tolerance, idempotent event claiming, plan flip, seat
  resolution, and `customer.subscription.updated` / `.deleted` handling all
  exist and are complete (`lib/billing/stripe.ts`,
  `app/api/billing/webhook/route.ts`). Billing is unconfigured, not unbuilt.
- Sending is gated by a deployment-level test-mode lock, an org-level live
  switch, per-campaign compliance checks, suppression enforcement at import,
  launch, and final delivery, and idempotency keys against double sends.
- Gmail tokens are encrypted at rest with Cloud KMS.

---

## 1. Google OAuth verification and CASA **[ext]** — start today

The long pole. Until this clears, `SIGNUP_MODE` cannot go to `open`, which
means every "Get started" button on the marketing site leads to a door that
only allowlisted domains can open.

- [ ] Submit the OAuth consent screen for verification. Scopes in use are
      `gmail.compose`, `gmail.readonly`, and `postmaster.readonly`
      (`lib/google/oauth.ts`).
- [ ] `gmail.readonly` is a restricted scope, so this triggers a **CASA Tier 2**
      security assessment by an independent assessor. Budget six to eight weeks
      and an assessor fee.
- [ ] Prepare what the review asks for: a demo video of the full consent flow,
      a published privacy policy URL (`/privacy` is live), a homepage that
      explains the scope use, and a domain you own and have verified in Search
      Console.
- [ ] Expect at least one round of follow-up questions. Answer within days,
      not weeks: the clock restarts on each reply.

**Interim:** stay on `SIGNUP_MODE=allowlist` and onboard by adding domains.
The product is fully usable this way; it just is not self-service.

---

## 2. Legal identity **[ext]**

Every public legal page currently defers the specifics to a signed order form,
which is honest but not sufficient for self-service.

- [ ] Operating entity name and registered address. **CAN-SPAM requires a
      valid physical postal address in every commercial email**, and the
      product already enforces a mailing-address placeholder before launch, so
      a customer cannot send without one. You need yours for the footer.
- [ ] Governing law and jurisdiction.
- [ ] Data retention schedule.
- [ ] Subprocessor list. At minimum: Google Cloud, Firebase, Stripe, and the
      AI provider if `GEMINI_API_KEY` is set.
- [ ] A DPA customers can sign.
- [ ] Counsel review of `/terms`, `/privacy`, `/acceptable-use`, `/compliance`.

---

## 3. The three surfaces a paying customer expects **[code]**

Each is a genuine blocker for charging money, not polish.

- [x] **Support contact path.** Built. `/help/contact` is the in-app form,
      which attaches workspace, plan, sending mode, Gmail status, and the
      running revision so the first reply can be an answer. `/support` is
      public, for the customer who cannot sign in and therefore cannot use the
      form. Requests land in the `supportRequests` collection with a quotable
      `CDN-XXXXXX` reference.
- [ ] **Set `SUPPORT_EMAIL`** on the Cloud Run service to a real monitored
      mailbox **[cfg]**. Until it is set, `/support` tells a locked-out
      customer that no address is published yet, which is honest but is not a
      support path. This is the one remaining piece of item 3's first surface.
      Optionally set `SUPPORT_WEBHOOK_URL` so a request pings a chat channel
      instead of waiting to be noticed in Firestore.
- [ ] **Account and workspace deletion.** No `deleteAccount`, no `deleteOrg`.
      This is a GDPR obligation, and it is the one most likely to become a
      complaint rather than a feature request.
- [ ] **Data export.** Leads and reply history go in and cannot come out.

---

## 4. Billing **[cfg]** — half a day once 1 and 2 are moving

The code is done. This is configuration and one end-to-end proof.

In the Stripe dashboard, test mode first:

- [ ] Create the Starter product and a recurring monthly price.
- [ ] Create the Team product and a recurring monthly per-seat price.
- [ ] Add a webhook endpoint at `https://<your-domain>/api/billing/webhook`
      subscribed to exactly: `checkout.session.completed`,
      `customer.subscription.updated`, `customer.subscription.deleted`. Those
      are the three the handler implements; others will be claimed and ignored.
- [ ] Enable the customer billing portal.

Then set these on the Cloud Run service:

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API keys |
| `STRIPE_WEBHOOK_SECRET` | The signing secret on the endpoint you just created |
| `STRIPE_PRICE_STARTER` | The Starter price ID (`price_...`) |
| `STRIPE_PRICE_TEAM` | The Team price ID (`price_...`) |

Prove it in test mode before switching keys:

- [ ] Subscribe with card `4242 4242 4242 4242`, confirm the org flips to the
      right plan with the right seat count.
- [ ] Cancel from the portal, confirm the plan drops.
- [ ] Replay a webhook from the Stripe dashboard, confirm it is recognised as
      a duplicate rather than double-applied.
- [ ] Then repeat all three against live keys with a real card and refund it.

**Until this is done, the landing page must keep saying no card is taken.**
It currently does. Do not change that copy before the box above is ticked.

---

## 5. Operations **[cfg]** — one hour

- [ ] Set `ERROR_WEBHOOK_URL` to a Slack incoming webhook. The reporting
      plumbing exists and is called throughout; the variable is simply unset,
      so production errors are console logs nobody reads. **Cheapest item on
      this list.**
- [ ] Uptime monitor on `/api/health`.
- [ ] Alert on Cloud Tasks queue depth and on the Cloud Scheduler sweep failing.
- [ ] Confirm `FORCE_TEST_MODE` is unset in production and set on staging.
- [ ] Confirm the runtime service account still holds only the four roles in
      `docs/operations/deployment.md`.

---

## 6. Deliverability posture **[cfg]** — before the first real customer

- [ ] Your own sending domain passes SPF, DKIM, and DMARC. The product checks
      a customer's domain for them; yours should not fail its own test.
- [ ] Decide the open-tracking default. It ships **on**, which puts a remote
      pixel in every cold email for data that Apple Mail Privacy Protection
      has already made mostly fictional.
- [ ] Understand the shared tracking domain. Every customer's pixel and
      rewritten links point at `APP_BASE_URL`, one hostname for the whole
      platform. One customer sending real spam gets that domain flagged and
      every other customer's mail then contains a flagged domain. Fine at five
      customers, dangerous at five hundred. The fix is a per-workspace CNAME
      with its own certificate, and it is infrastructure work worth scheduling
      before it bites.

---

## 7. Flip the switch

In order, no skipping:

- [ ] OAuth verification granted (item 1).
- [ ] Legal pages carry a real entity and address (item 2).
- [ ] Support, deletion, and export shipped (item 3).
- [ ] Live Stripe keys proven end to end (item 4).
- [ ] Error alerting on (item 5).
- [ ] Set `SIGNUP_MODE=open` and deploy.
- [ ] Sign up as a stranger, from a personal Gmail, on a clean browser
      profile. Get to a sent email without asking anyone for help.

---

## Deploy

See `deployment.md` for the full runbook. The short version, from Cloud Shell:

```bash
cd ~/gmail-campaign-app && git checkout main && git pull origin main

CADENCE_ROLLBACK_REVISION="$(gcloud run services describe outreach \
  --project email-tool-502714 --region us-central1 \
  --format='value(status.latestReadyRevisionName)')"

gcloud builds submit --project email-tool-502714 --config cloudbuild.yaml \
  --substitutions="COMMIT_SHA=$(git rev-parse HEAD),_REGION=us-central1"

CADENCE_SERVICE_URL="$(gcloud run services describe outreach \
  --project email-tool-502714 --region us-central1 --format='value(status.url)')"
curl --fail --show-error "${CADENCE_SERVICE_URL}/api/health"
```

Rollback is one command:

```bash
gcloud run services update-traffic outreach \
  --project email-tool-502714 --region us-central1 \
  --to-revisions="${CADENCE_ROLLBACK_REVISION}=100"
```

Deploy Firestore rules and indexes **before** the app whenever either changed:

```bash
npx firebase deploy --project email-tool-502714 --only firestore:rules,firestore:indexes
```

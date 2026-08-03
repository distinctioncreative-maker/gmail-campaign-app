# Cadence Public Launch Audit

**Audit date:** 2026-08-03

**Repository:** `distinctioncreative-maker/gmail-campaign-app`

**Production project:** `email-tool-502714` under Alpine's Google Cloud account

This is the shared launch record for Codex, Claude Code, and human operators.
Update it whenever a gate changes. It is a product and engineering assessment,
not legal advice.

## Executive decision

Cadence is ready to be **sold as a managed private pilot** after the branch
quality gate passes and the deployment is reviewed. It is **not ready for
anonymous public self-service**.

Keep `SIGNUP_MODE=allowlist`. Do not describe the product as generally
available, enable arbitrary Google signups, or activate live Stripe billing
until the P0 public-launch gates below are complete.

The sell-today offer is:

- A guided Starter or Team pilot using an approved Google Workspace domain.
- Test mode first, followed by an explicit administrator go-live review.
- A documented sending cap, approved use case, and named support contact.
- Pilot requests collected through the public landing page.
- Commercial terms agreed outside the app until production Stripe and legal
  documents are approved.

## What this pass fixed

- Preserved the production hardening work in two reviewable commits.
- Changed commercial-email footer requirements from warnings to hard launch
  blocks. The initial template and every A/B rotation template must include
  both `{{physical_address}}` and `{{unsubscribe_text}}`.
- Added unit coverage for the compliance-placeholder rule.
- Removed customer-facing claims that Cadence can guarantee inbox placement.
- Replaced unshipped SSO/SLA claims with services that can actually be
  delivered during a managed rollout.
- Generalized the landing page beyond sales teams to founders, recruiters,
  agencies, fundraising, partnerships, and other outreach use cases.
- Changed the public funnel from "coming soon" to an honest private-pilot
  request flow.
- Clarified the Team plan's two-seat minimum across marketing and billing UI.
- Replaced the obsolete user guide with the shipped workflow and safety model.

## Lifecycle, compliance, and lead-scale follow-up

The August 3 release candidate adds the following without changing the
managed-pilot launch decision:

- fixes the template editor's caret reset by avoiding same-editor DOM rewrites
  during visual input while preserving sanitization at preview, test, and save
  boundaries;
- adds active, archived, and Recently Deleted campaign views, retained
  per-campaign KPIs and deletion dates, restoration, a separate permanent
  deletion step, and exclusion of deleted campaigns from current workspace and
  rep totals, reports, replies, and health summaries;
- shows contact Date added and replaces the bounded directory read with stable
  250-row cursor pages while splitting imports into safe 200-row requests, so
  there is no application-wide total-lead cap;
- defaults click/open tracking on for new campaigns with an explicit opt-out,
  keeps the privacy and deliverability caveat visible, and excludes the signed
  unsubscribe destination from click tracking;
- adds a default-on compliance-footer helper while keeping physical-address
  and opt-out placeholders as non-optional launch requirements;
- appends a visible signed unsubscribe link after tracking instrumentation and
  retains RFC 8058 headers and idempotent suppression behavior;
- publishes managed-pilot Terms, Privacy, Acceptable Use and Anti-Spam, and
  Compliance pages with explicit unresolved legal facts and limitations; and
- records future lead research and sourcing as a separately reviewed roadmap
  item rather than shipping unrestricted scraping.
- adds a personalized workspace questionnaire, safe first-success milestone,
  and keyboard/reduced-motion product tour without turning intended volume
  into a provider or plan override;
- adds reusable custom role names mapped to the three audited permission
  levels plus an admin-defined, cycle-safe parent-team hierarchy; and
- replaces literal status palettes and opacity-reduced small text across the
  authenticated product with measured light/dark semantic contrast tokens.

## Enterprise workflow follow-up

The next review branch adds a coherent operator-experience phase without
changing the managed-pilot launch decision:

- Reports can isolate one campaign or compare all campaigns and analyze
  30-day, 90-day, or 12-month send cohorts.
- Exact all-time counters are clearly separated from cohort timing charts.
- Campaign, lead, template, and Help surfaces use denser enterprise layouts
  with clearer filters, progress, rates, and professional iconography.
- A tracked campaign creates one deduplicated first-open notification per
  recipient, with explicit wording that image preloading can cause the signal.
- Application copy no longer uses em dashes, with a source-level regression
  test.
- `docs/product/strategy.md` records current first-party competitor evidence,
  responsible sending-volume language, and the P0/P1/P2 product sequence.

These are product and UX improvements. They do not authorize
`SIGNUP_MODE=open`, live Stripe, a production deployment, or weakened sending
controls.

## P0 gates before public self-service

| Gate | Current state | Required evidence | Owner |
|---|---|---|---|
| Legal identity and documents | Partially addressed. Managed-pilot Terms, Privacy, AUP/Anti-Spam, and Compliance pages now exist, but they deliberately defer unresolved legal facts. No DPA or counsel approval is claimed. | Legal entity name, business address, privacy/support email, governing jurisdiction, counsel-approved documents, DPA, retention schedule, subprocessor list, and signed pilot terms that match production operations. | Founder + counsel |
| Google OAuth verification | Blocked. Production remains allowlisted. | Verified app branding/domain, approved requested scopes, privacy links, demo video, verification approval, and any required CASA assessment. | Founder + security |
| Stripe production billing | Code exists; external configuration is unverified. | Test-mode Checkout, webhook, plan/seat update, portal, cancellation, retry, and idempotency evidence; then separately configured live products, prices, webhook, tax decision, receipts, and support process. | Engineering + finance |
| Account/data deletion | Not implemented. | Authenticated deletion request, ownership/team transfer rules, retention exceptions, deletion job, audit trail, and a public deletion-request page. | Product + counsel |
| Data export/DSAR | Not implemented as a complete account export. | User and organization export covering contacts, campaigns, templates, settings, billing metadata, and audit records, with an operator runbook and identity verification. | Engineering + privacy |
| Error alerting and uptime | Structured logs exist; production webhook/monitor is not confirmed. | `ERROR_WEBHOOK_URL`, external `/api/health` monitor, escalation target, test alert, and incident drill. | Operations |
| Cadence-owned infrastructure | Production is owned by Alpine. | Cadence domain and Workspace, migration plan, new GCP/Firebase project or approved transfer, new KMS/OAuth credentials, data migration rehearsal, and reconnect communication. | Founder + cloud admin |
| Abuse prevention | Partially addressed. A public AUP and Anti-Spam baseline prohibits scraping, purchased lists, evasion, and deceptive use, while product controls can pause unsafe sending. Complaint intake, case handling, customer verification, and evidence-retention operations remain unverified. | Counsel-approved AUP, complaint intake, suspension and appeal procedure, customer verification, per-tenant emergency stop, evidence-retention rules, and an exercised operator runbook. | Trust + operations |
| Compliance review by market | Partially addressed. Address and opt-out placeholders remain launch requirements, real messages receive visible and header-based signed opt-outs, and suppressions are enforced. Non-US consent and regional rules are not productized. | Launch-country decision, lawful-basis/consent process where required, regional suppression rules, customer contractual duties, approved business identity/address, and counsel approval. | Founder + counsel |
| Production deployment review | No deployment is authorized by this audit alone. | Clean CI, reviewed PR, exact env diff, database/index migration review, rollback revision, smoke test, test-mode proof, then explicit deploy approval. | Engineering |

### Legal facts still needed

Do not invent these in code or policy pages:

- Exact legal entity operating Cadence.
- Principal business and mailing address.
- Privacy, legal, abuse, and customer-support email addresses.
- Governing state/country and primary launch markets.
- Data-retention periods and deletion exceptions.
- Final subprocessors and whether optional Gemini features may process customer
  content.

## P1 product work for a trustworthy launch

1. **One-click unsubscribe**
   - Complete in source: signed tenant-scoped visible URL,
     `List-Unsubscribe` / `List-Unsubscribe-Post` headers, scanner-safe GET,
     idempotent POST suppression, and exclusion from click tracking.
   - Remaining launch evidence: verify the public base URL, live rendering,
     Gmail header behavior, suppression, and follow-up cancellation in a
     test-mode production smoke exercise.

2. **Complaint handling**
   - Add an organization-level complaint state, automatic campaign stop
     threshold, operator alert, and audited re-enable flow.

3. **Pilot operations**
   - Add status, owner, notes, and follow-up state to pilot requests instead of
     treating them as a flat email list.
   - Notify an operator when a qualified pilot request arrives.
   - Add a support/contact destination to the public site once the address is
     approved.

4. **Billing clarity**
   - Show included limits in every pricing surface from `lib/billing/plans.ts`.
   - Add a seat selector for Team Checkout.
   - Define trial, refund, cancellation, proration, failed-payment, and tax
     handling before live billing.

5. **Onboarding**
   - Add an explicit use-case choice, target geography, expected daily volume,
     and compliance acknowledgment.
   - Require a successful self-test and domain-health review before requesting
     live sending.

6. **Reliability**
   - Run the Firestore emulator suite in CI with Java 21.
   - Add a staging smoke test that proves a test-mode message cannot reach the
     original recipient.
   - Add recovery exercises for ambiguous Gmail results, delayed follow-ups,
     revoked Gmail access, and Stripe webhook replay.

## Competitive position

Cadence should not try to match every high-volume platform before selling.
The strongest near-term wedge is **trustworthy, Gmail-native outreach for
small teams that value control and real threads more than mailbox farms**.

| Capability | Cadence now | Market baseline | Decision |
|---|---|---|---|
| Gmail-native sending and threads | Strong | Common but often one module among many | Lead with this |
| Test-mode safety gate | Strong differentiator | Rarely prominent | Lead with this |
| Tenant isolation and roles | Strong for current size | Expected for team products | Keep hardening |
| Reply/bounce triage | Competitive | Expected | Improve intent QA |
| AI writing and brand memory | Competitive, optional | Expected | Keep optional and transparent |
| SPF/DKIM/DMARC/Postmaster visibility | Competitive | Expected | Never promise placement |
| Multi-inbox rotation | Missing | Common in Instantly/Smartlead-class tools | Later, after compliance model |
| Inbox warmup | Missing | Common in scale-first tools | Partner or build only after risk review |
| Enrichment/contact database | Missing | Common in larger suites | Integrate rather than build first |
| CRM integrations | CSV/Salesforce paste only | Native CRM sync expected | Prioritize Salesforce/HubSpot |
| Multichannel | Missing | Lemlist and larger suites support LinkedIn/calls/etc. | Later |
| Agency/client workspaces | Missing | Important for agencies | High-value expansion |
| Public API/webhooks | Missing | Expected for mature platforms | Design after API versioning |
| Native mobile apps | Missing | Useful, not a launch blocker for desktop campaign setup | Build mobile companion first |
| SOC 2 / SSO / SCIM | Not shipped | Enterprise expectation | Do not advertise yet |

Pricing is intentionally below many scale-first competitors, but Cadence also
supports fewer inboxes and lower volume. Sell the safety, Gmail fidelity,
guided setup, and workflow quality rather than claiming feature parity.

The dated source set, provider-limit analysis, and expanded competitor matrix
now live in [docs/product/strategy.md](docs/product/strategy.md). Recheck those
first-party pages before publishing any named comparison or price claim.

## Mobile readiness plan

Do not wrap the current website and call it a mobile architecture. The
existing session-cookie flow is web-specific.

### Foundation before iOS/Android implementation

1. Add a versioned API namespace, beginning with `/api/v1`.
2. Accept verified Firebase ID tokens as bearer credentials for native clients
   while retaining secure HttpOnly cookies for the web app.
3. Keep `AuthContext` and repository tenancy checks shared so native access
   cannot bypass the server's owner/organization boundaries.
4. Define a typed API contract and stable pagination/error envelope.
5. Add device registration and a provider-neutral notification service.
6. Add OAuth mobile redirect/deep-link handling without exposing Gmail refresh
   tokens to the device.
7. Build account deletion, data export, privacy disclosures, and consent
   withdrawal before store submission.
8. Keep campaign creation and high-risk go-live controls web-first initially.
   Make the first mobile release a companion for replies, alerts, approvals,
   and campaign status.

Apple requires apps that support account creation to let users initiate
account deletion in the app. Google Play requires an in-app deletion path and
a public web deletion resource. Both stores also require accurate privacy/data
safety disclosures.

## Sell-today checklist

Use this for each private pilot:

- [ ] Customer use case and target countries reviewed.
- [ ] Customer domain added to the allowlist intentionally.
- [ ] Customer agrees to pilot terms, AUP, and data-processing terms.
- [ ] Gmail/OAuth access succeeds.
- [ ] Sender name, business address, and opt-out text are complete.
- [ ] SPF, DKIM, and DMARC reviewed; Postmaster connected when available.
- [ ] Test destination configured and deployment test lock confirmed.
- [ ] Test email inspected by the customer.
- [ ] Daily cap and send window agreed.
- [ ] Initial recipient list checked for source, duplicates, opt-outs, and prior
  contact.
- [ ] Admin explicitly enables live sending only after review.
- [ ] Operator monitors the first campaign and has a stop/incident contact.
- [ ] Payment is not taken through in-app Stripe until the full test evidence
  is recorded.

## Authoritative references

- FTC CAN-SPAM compliance guide:
  <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>
- Gmail sender guidelines:
  <https://support.google.com/a/answer/81126>
- Google restricted-scope verification:
  <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>
- Google API Services User Data Policy:
  <https://developers.google.com/terms/api-services-user-data-policy>
- Apple account deletion:
  <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Apple App Privacy Details:
  <https://developer.apple.com/app-store/app-privacy-details/>
- Google Play account deletion:
  <https://support.google.com/googleplay/android-developer/answer/13327111>
- Android Data Safety:
  <https://developer.android.com/privacy-and-security/declare-data-use>
- Instantly pricing:
  <https://instantly.ai/pricing>
- Lemlist product overview:
  <https://www.lemlist.com/>

## Next implementation order

1. Pass the full local quality gate and publish this hardening branch.
2. Complete Stripe test-mode end-to-end evidence.
3. Supply legal identity facts and have counsel approve the public documents.
4. Turn on alerting and uptime monitoring.
5. Add pilot-request workflow and support routing.
6. Implement account deletion/export and verify the shipped one-click
   unsubscribe foundation in the production smoke run.
7. Complete Cadence-owned infrastructure and OAuth/CASA work.
8. Only then consider `SIGNUP_MODE=open`.

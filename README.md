# Cadence — Multi-User Gmail Campaign Platform

Internal web app that lets each salesperson connect their own Gmail, import
leads (pasted Salesforce lists, Google Sheets, CSV), build personalized
campaigns with follow-up sequences, and review all activity — with strict
per-user data isolation and layered send-safety controls.

**Stack**: Next.js 16 (App Router, TypeScript strict) · Tailwind CSS ·
Cloud Run · Firebase Auth · Firestore · Cloud Tasks · Cloud Scheduler ·
Secret Manager · Cloud KMS · Gmail API.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth, org membership, per-user isolation, Gmail connect (KMS-encrypted tokens), dashboard shell | ✅ Built |
| 2 | Salesforce paste parser + CSV import, contacts, prior-contact detection, suppressions | ✅ Built |
| 3 | Templates (visual / starter / paste HTML / Gmail draft), personalization, onboarding, sender profile | ✅ Built |
| 4 | Campaign wizard, Cloud Tasks sending engine, idempotency, windows/caps, pause/resume/cancel controls | ✅ Built |
| 5 | Follow-up sequences, reply detection, unsubscribe + bounce handling, notifications | ✅ Built |
| 6 | Reports, Test Center, roles/admin, privacy-preserving team collision, system health | ✅ Built |
| 7 | Emulator isolation tests, deployment automation | ✅ Built |
| 8 | Analytics dashboard, template A/B rotation, built-in spam checker, dark mode, Cadence design system | ✅ Built |
| 9 | Lead command center: editable leads + notes, real engagement tracking (emails sent / times replied), Do-Not-Email, delete | ✅ Built |
| 10 | Teams (Team Lead dashboards, roster management, read-only drill-down), Replies inbox, admin troubleshooting console, daily activity rollups | ✅ Built |

Google Sheet import + audit-mirror spreadsheet are intentionally deferred
(CSV import covers file imports; the import chooser reserves the slot).

## Quick start

```bash
npm install
cp .env.example .env        # fill in values — see SETUP.md
npm run dev                 # http://localhost:3000
npm test                    # unit tests (109) — parser, scheduling, eligibility, safety…
npm run test:emulator       # Firestore rules isolation tests (needs Java)
npm run typecheck
npm run lint
npm run build
```

After the first Cloud Run deploy, run `bash scripts/setup-cloud.sh PROJECT_ID`
once to provision the Cloud Tasks queue, service accounts/IAM, and the
Cloud Scheduler sweeps (reply/bounce/repair).

## Email safety (read this first)

`TEST_MODE` defaults to **on**. While on, every outbound email is redirected
to `TEST_EMAIL_DESTINATION` and its subject is prefixed `[TEST]` inside
`lib/gmail/safety.ts` — applied immediately before the Gmail API call, with
no send path around it. Real sending requires an explicit `TEST_MODE=false`.

## Documentation

- [SETUP.md](SETUP.md) — local development and Google Cloud configuration
- [DEPLOYMENT.md](DEPLOYMENT.md) — Cloud Run deployment
- [SECURITY.md](SECURITY.md) — controls and threat notes
- [DATA_MODEL.md](DATA_MODEL.md) — Firestore collections and isolation
- [GOOGLE_OAUTH.md](GOOGLE_OAUTH.md) — scopes and consent configuration
- [SALESFORCE_PARSER.md](SALESFORCE_PARSER.md) — paste-format parsing rules
- [CAMPAIGN_SAFETY.md](CAMPAIGN_SAFETY.md) — send-safety design
- [OPERATIONS.md](OPERATIONS.md) · [TESTING.md](TESTING.md) ·
  [USER_GUIDE.md](USER_GUIDE.md) · [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)

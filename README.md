# Outreach — Multi-User Gmail Campaign Platform

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
| 2 | Salesforce paste parser + preview/import, contacts, suppressions | ✅ Built (Sheet/CSV import pending) |
| 3 | Templates + personalization | 🔜 |
| 4 | Campaign wizard, Cloud Tasks sending engine, idempotency | 🔜 |
| 5 | Follow-ups, reply/bounce detection | 🔜 |
| 6 | Team/admin, collision warnings | 🔜 |
| 7 | Emulator isolation tests, e2e, deployment automation | 🔜 |

## Quick start

```bash
npm install
cp .env.example .env        # fill in values — see SETUP.md
npm run dev                 # http://localhost:3000
npm test                    # unit tests (parser, crypto, send safety)
npm run typecheck
npm run lint
npm run build
```

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

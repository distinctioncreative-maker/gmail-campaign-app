# Setup

## Prerequisites

- Node.js 22+
- A Google Cloud project **owned by your Google Workspace organization**
  (required for internal OAuth consent — see GOOGLE_OAUTH.md)
- `gcloud` CLI authenticated against that project

## Operator CLI authentication

CLI credentials are machine-local and must never be committed or pasted into
agent chat. They persist only when Codex and Claude Code use the same
persistent terminal/home directory. Authenticate one tool at a time with the
Alpine Google Workspace/Stripe accounts, and verify the target before any
write:

### Google Cloud SDK

```bash
gcloud auth login --no-launch-browser
gcloud config set project email-tool-502714
gcloud config list
gcloud auth list
gcloud run services list --region us-central1
gcloud auth application-default login --no-launch-browser
```

The active account must be the authorized `alpinefundings.com` operator, the
project must be `email-tool-502714`, and the service list must contain
`outreach`. `gcloud auth login` authorizes CLI operations;
Application Default Credentials are separate and are used by the app's local
Google client libraries.

### Firebase CLI

Firebase CLI is pinned as a development dependency, and `.firebaserc` already
selects `email-tool-502714`:

```bash
npx firebase login --no-localhost
npx firebase projects:list
npx firebase use email-tool-502714
npx firebase firestore:indexes --project email-tool-502714
```

Firebase CLI 15 requires Java 21 or newer for emulator runs.

### Stripe CLI

```bash
npx @stripe/cli login
npx @stripe/cli get /v1/account
npx @stripe/cli listen \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted \
  --forward-to http://localhost:3000/api/billing/webhook
```

Copy the temporary `whsec_...` value printed by `listen` into the untracked
local `.env` as `STRIPE_WEBHOOK_SECRET`. Never commit it. The end-to-end test
must use Stripe sandbox keys and confirm Checkout, webhook processing,
plan/seat changes, portal quantity behavior, and cancellation before live
keys are installed.

## 1. Google Cloud project

```bash
gcloud services enable \
  firestore.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudkms.googleapis.com \
  gmail.googleapis.com \
  identitytoolkit.googleapis.com \
  run.googleapis.com
```

Use **separate development and production projects**.

## 2. Firebase Authentication

1. Add Firebase to the Cloud project (console.firebase.google.com).
2. Enable the **Google** sign-in provider.
3. Copy the web app config values into `NEXT_PUBLIC_FIREBASE_*`.

## 3. Firestore

Create a Firestore database in native mode, then deploy rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 4. OAuth client (Gmail connect)

1. APIs & Services → OAuth consent screen → **Internal** while the app is
   allowlisted. Public self-serve launch requires an External app plus
   Google verification/CASA.
2. Create an **OAuth client ID** (Web application).
3. Authorized redirect URI: `<APP_BASE_URL>/api/gmail/callback`.
4. Put client ID/secret in `.env` (locally) / Secret Manager (production).

## 5. KMS key (refresh-token encryption)

```bash
gcloud kms keyrings create outreach --location=us-central1
gcloud kms keys create gmail-tokens \
  --keyring=outreach --location=us-central1 --purpose=encryption
```

Set `TOKEN_KMS_KEY_RESOURCE=projects/PROJECT/locations/us-central1/keyRings/outreach/cryptoKeys/gmail-tokens`
and grant the Cloud Run runtime service account
`roles/cloudkms.cryptoKeyEncrypterDecrypter` on the key.

For local development only, you may instead set:

```bash
LOCAL_DEV_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

Production refuses to encrypt without KMS.

## 6. Environment

`cp .env.example .env` and fill in every value. Notes:

- `ALLOWED_GOOGLE_WORKSPACE_DOMAIN` — comma-separated domains accepted while
  `SIGNUP_MODE=allowlist` (both email domain and `hd` claim are checked).
- `SIGNUP_MODE` — keep `allowlist` until OAuth verification/CASA is complete.
- `SESSION_SECRET` — 32+ random chars (`openssl rand -base64 32`).
- `TEST_EMAIL_DESTINATION` — safe redirect target while an org is in TEST.
- `FORCE_TEST_MODE=true` — optional deployment lock for staging/incidents;
  the org-level in-app mode defaults to TEST without it.

## 7. Run

```bash
npm install
npm run dev
```

Application Default Credentials are used for Firestore/KMS locally:

```bash
gcloud auth application-default login
```

The first account to transactionally claim an organization becomes its
**ADMIN**; later sign-ins join as **SALES_REP**.

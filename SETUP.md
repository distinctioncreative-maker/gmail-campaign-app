# Setup

## Prerequisites

- Node.js 22+
- A Google Cloud project **owned by your Google Workspace organization**
  (required for internal OAuth consent — see GOOGLE_OAUTH.md)
- `gcloud` CLI authenticated against that project

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

1. APIs & Services → OAuth consent screen → **Internal**.
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

- `ALLOWED_GOOGLE_WORKSPACE_DOMAIN` — sign-ins outside this domain are rejected
  server-side (both the email domain and the `hd` claim are checked).
- `SESSION_SECRET` — 32+ random chars (`openssl rand -base64 32`).
- `TEST_MODE` / `TEST_EMAIL_DESTINATION` — keep `TEST_MODE=true` everywhere
  except a deliberate production launch.

## 7. Run

```bash
npm install
npm run dev
```

Application Default Credentials are used for Firestore/KMS locally:

```bash
gcloud auth application-default login
```

The first account to sign in becomes the organization **ADMIN**; later
sign-ins join as **SALES_REP**.

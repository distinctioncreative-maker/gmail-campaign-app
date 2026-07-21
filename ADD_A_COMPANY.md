# Add a Company

There are **two ways** to add a company. Pick based on how separate you need
the infrastructure to be.

## Option A — Same app, add the domain (fastest) ✅

The app groups users into a **separate organization per email domain**, so you
can serve multiple companies from **one deployment** with fully isolated orgs
(each gets its own admin, team, settings, and data; leads/campaigns are always
per-user private).

To add e.g. **everestbusinessfunding.com**:

1. Add the domain to the allowlist env var (keep the existing/primary domain
   **first** so nothing migrates):
   ```bash
   gcloud run services update outreach --region us-central1 \
     --update-env-vars ALLOWED_GOOGLE_WORKSPACE_DOMAIN=alpinefundings.com,everestbusinessfunding.com
   ```
2. In the **Firebase console → Authentication → Settings → Authorized domains**,
   nothing changes (same app URL). Everest users sign in at the same URL with
   their `@everestbusinessfunding.com` Google account.
3. The **first everest person to sign in becomes that org's admin** and it
   starts in **test mode** — their admin flips real sending on when ready.
4. Done. Everest sees none of alpine's org/team; alpine's admin and settings
   are untouched.

Use this when both companies are fine sharing the same Cloud Run + Firebase
project (data is still isolated by org and by user). Note: both domains share
the app's single Google OAuth client, so the OAuth consent screen must permit
both — easiest if both domains are in the same Workspace, or the client is
configured "External".

## Option B — Separate deployment (below)

Cadence can also run **one copy per Google Workspace company**. Each copy
lives in that company's own Google Cloud project, uses "Internal" Gmail
permissions (no Google review, long-lived sending), and keeps its
infrastructure fully separate. Choose this when the companies must not share
any cloud project or OAuth client.

Use this to stand up a new company (e.g. **everestbusinessfunding.com**). It's
the same ~30-minute setup you did for the first company. Everything below is
done by a **Google Workspace admin of the new company**.

Throughout, replace:
- `COMPANY_DOMAIN` → the company's domain (e.g. `everestbusinessfunding.com`)
- `PROJECT_ID` → a new project id you'll create (e.g. `everest-massleader`)
- `TEST_EMAIL` → an inbox at that company for safe test sends

---

## 1. Create the Google Cloud project (5 min)

1. Sign in to https://console.cloud.google.com **with an admin account of the
   new company's Workspace** (this is what makes "Internal" possible).
2. Top bar → project dropdown → **New Project** → name it `PROJECT_ID` → Create.
3. Make sure it's selected, then open **Cloud Shell** (the `>_` icon, top right).

Paste (one block):

```bash
gcloud config set project PROJECT_ID
gcloud services enable \
  firestore.googleapis.com cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com \
  cloudkms.googleapis.com gmail.googleapis.com \
  identitytoolkit.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2. Database (1 min)

```bash
gcloud firestore databases create --location=nam5
```

## 3. Firebase sign-in (3 min, in the browser)

1. https://console.firebase.google.com → **Add project** → pick the existing
   `PROJECT_ID` from the dropdown → continue (Analytics optional).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**,
   set a support email, Save.
3. Gear → **Project settings → Your apps → `</>` (web)** → nickname `massleader`
   → Register. Copy the `apiKey`, `authDomain`, `projectId` values — you'll
   paste them in step 6.

## 4. OAuth consent + client (3 min)

1. **APIs & Services → OAuth consent screen → Internal** → fill app name
   (`Cadence`) + support email → Save.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Leave the redirect URI blank for now (you'll add it after the first deploy).
4. Copy the **Client ID** and **Client secret**.

## 5. Encryption key (1 min)

```bash
gcloud kms keyrings create massleader --location=us-central1
gcloud kms keys create gmail-tokens \
  --keyring=massleader --location=us-central1 --purpose=encryption
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
gcloud kms keys add-iam-policy-binding gmail-tokens \
  --keyring=massleader --location=us-central1 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
```

## 6. Get the code + set this company's public config (2 min)

```bash
gh auth login          # GitHub.com → HTTPS → login with browser, follow the code
gh repo clone distinctioncreative-maker/gmail-campaign-app
cd gmail-campaign-app
```

Now set this company's **Firebase web values** (public, safe to include). Paste,
replacing the four values with the ones from step 3 and your domain:

```bash
cat > .env.production <<'EOF'
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=PROJECT_ID
NEXT_PUBLIC_ALLOWED_DOMAIN=COMPANY_DOMAIN
EOF
```

## 7. Deploy (5–10 min)

```bash
SESSION_SECRET=$(openssl rand -base64 48)

gcloud run deploy massleader --source . --region us-central1 --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars "^##^GOOGLE_CLOUD_PROJECT_ID=PROJECT_ID##FIREBASE_PROJECT_ID=PROJECT_ID##ALLOWED_GOOGLE_WORKSPACE_DOMAIN=COMPANY_DOMAIN##SESSION_SECRET=${SESSION_SECRET}##TOKEN_KMS_KEY_RESOURCE=projects/PROJECT_ID/locations/us-central1/keyRings/massleader/cryptoKeys/gmail-tokens##TEST_EMAIL_DESTINATION=TEST_EMAIL##GOOGLE_OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID##GOOGLE_OAUTH_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET"
```

Answer **y** if it asks about Artifact Registry. When it finishes it prints a
**Service URL** like `https://massleader-xxxx-uc.a.run.app`. Copy it.

## 8. Wire the URL back into OAuth + Firebase (2 min)

1. Set the redirect URI env vars on the service (replace `SERVICE_URL`):

```bash
gcloud run services update massleader --region us-central1 \
  --update-env-vars "GOOGLE_OAUTH_REDIRECT_URI=SERVICE_URL/api/gmail/callback,APP_BASE_URL=SERVICE_URL"
```

2. In **APIs & Services → Credentials → your OAuth client → Authorized redirect
   URIs**, add `SERVICE_URL/api/gmail/callback` → Save.
3. In **Firebase → Authentication → Settings → Authorized domains**, add the
   `SERVICE_URL` host (without `https://`).

## 9. Turn on background sending (once)

```bash
bash scripts/setup-cloud.sh PROJECT_ID us-central1 massleader
```

That creates the Cloud Tasks queue, service accounts, and the reply/bounce
sweeps for this company's copy.

---

## Done

- Give the company's salespeople the **Service URL**. They sign in with their
  `COMPANY_DOMAIN` Google account and click **Connect Gmail** — it just works,
  because the OAuth screen is Internal to their own Workspace.
- The **first person to sign in becomes that company's admin**, and controls
  the test→live switch under Administration → Sending mode.
- This copy is completely independent: its own database, its own users, its own
  sending mode. Nothing is shared with the other company.

## Adding more companies later

Repeat this guide for each new Workspace company. There's no limit — one small
deployment per company, each Internal to its own Workspace.

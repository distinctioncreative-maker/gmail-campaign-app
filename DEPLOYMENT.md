# Deployment

Target: Google Cloud Run, separate dev and prod projects.

## Build & deploy

Manual:

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions _REGION=us-central1
```

Or connect the repo to Cloud Build triggers for CI/CD (`cloudbuild.yaml`
builds the Docker image, pushes to Artifact Registry, deploys to the
`gmail-campaign` Cloud Run service).

## Cloud Run configuration

- Service account: dedicated runtime SA with only
  - `roles/datastore.user`
  - `roles/cloudkms.cryptoKeyEncrypterDecrypter` (on the token key only)
  - `roles/cloudtasks.enqueuer`
  - `roles/secretmanager.secretAccessor` (on app secrets only)
- Environment: set every variable from `.env.example`; mount
  `GOOGLE_OAUTH_CLIENT_SECRET` and `SESSION_SECRET` from Secret Manager,
  not plain env vars.
- Min instances 0 is fine for the UI; revisit when Cloud Tasks workers
  land (phase 4) to bound task latency.
- `--no-allow-unauthenticated` + Identity-Aware Proxy is optional extra
  hardening for an internal tool; the app also enforces Workspace-domain
  sign-in itself.

## OAuth redirect

Add `https://<your-domain>/api/gmail/callback` to the OAuth client's
authorized redirect URIs, and set `GOOGLE_OAUTH_REDIRECT_URI` and
`APP_BASE_URL` to match.

## Firestore

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Production safety checklist

- [ ] `TOKEN_KMS_KEY_RESOURCE` set (app refuses local-dev cipher in prod)
- [ ] `LOCAL_DEV_ENCRYPTION_KEY` NOT set
- [ ] `ALLOWED_GOOGLE_WORKSPACE_DOMAIN` set
- [ ] `TEST_MODE=true` until a deliberate, reviewed launch
- [ ] Secrets in Secret Manager, none in env files or the repo
- [ ] Firestore backups: enable scheduled exports
  (`gcloud firestore export gs://<backup-bucket>` via Cloud Scheduler)

## Backups & recovery

- Firestore: daily scheduled export to a versioned GCS bucket.
- Recovery: `gcloud firestore import` into a fresh database, then
  redeploy. Gmail refresh tokens survive restore (ciphertext + unchanged
  KMS key); users whose grants were revoked simply reconnect.

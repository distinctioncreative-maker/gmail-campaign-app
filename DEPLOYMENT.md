# Deployment

Production target: Cloud Run service `outreach` in `email-tool-502714`,
region `us-central1`, owned by the Alpine Google Workspace account. Confirm
the active account and project before every infrastructure command.

## Build & deploy

Manual:

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions _REGION=us-central1
```

Or connect the repo to Cloud Build triggers for CI/CD (`cloudbuild.yaml`
builds the Docker image, pushes to Artifact Registry, deploys to the
`outreach` Cloud Run service). GitHub Actions is the quality gate; Cloud
Build is the deploy path.

## Cloud Run configuration

- Service account: dedicated runtime SA with only
  - `roles/datastore.user`
  - `roles/cloudkms.cryptoKeyEncrypterDecrypter` (on the token key only)
  - `roles/cloudtasks.enqueuer`
  - `roles/secretmanager.secretAccessor` (on app secrets only)
- Environment: set every variable from `.env.example`; mount
  `GOOGLE_OAUTH_CLIENT_SECRET` and `SESSION_SECRET` from Secret Manager,
  not plain env vars.
- Min instances 0 is acceptable while cold-start latency is tolerable.
- The Cloud Run service allows unauthenticated HTTP so the public landing,
  sign-in, health, Stripe webhook, and tracking routes work. Dashboard APIs
  enforce app sessions; task/cron routes enforce OIDC.
- Run `scripts/setup-cloud.sh email-tool-502714 us-central1 outreach` after
  infrastructure changes. It sets queue concurrency and provisions all
  reply/bounce/repair/metrics/benchmark schedules, plus Firestore TTL for
  `rateLimits` and `stripeEvents`.
- Cloud Tasks has a 30-day maximum schedule time. Cadence deliberately
  publishes only within 29 days; the hourly repair job promotes durable
  longer-delay queue records when they enter that horizon. Do not disable
  the repair job.

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
- [ ] `ALLOWED_GOOGLE_WORKSPACE_DOMAIN` set and `SIGNUP_MODE=allowlist`
      until OAuth verification/CASA is complete
- [ ] Org sending mode remains TEST until deliberate admin go-live;
      use `FORCE_TEST_MODE=true` as the deployment emergency lock
- [ ] Secrets in Secret Manager; only public `NEXT_PUBLIC_FIREBASE_*`
      browser config is tracked
- [ ] Stripe test Checkout → signed webhook → plan flip verified before
      installing live keys
- [ ] Stripe Customer Portal configuration does not permit an unguarded seat
      reduction below the active roster; test quantity changes and
      cancellation during the end-to-end billing exercise
- [ ] `/api/health` uptime alert and `ERROR_WEBHOOK_URL` configured
- [ ] Firestore backups: enable scheduled exports
  (`gcloud firestore export gs://<backup-bucket>` via Cloud Scheduler)

## Backups & recovery

- Firestore: daily scheduled export to a versioned GCS bucket.
- Recovery: `gcloud firestore import` into a fresh database, then
  redeploy. Gmail refresh tokens survive restore (ciphertext + unchanged
  KMS key); users whose grants were revoked simply reconnect.

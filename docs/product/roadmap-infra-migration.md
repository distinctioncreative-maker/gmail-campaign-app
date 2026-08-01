# TODO

## Migrate infra off Alpine's Google account to Cadence's own account
Once the Cadence domain is purchased:

- Create a new Gmail / Google Workspace account for Cadence (new domain).
- Move Cadence's Firebase + Google Cloud infra off Alpine's account
  (`alpinefundings.com`, GCP project `email-tool-502714`) onto the new account.
- **Recommended approach (Option B from planning discussion):** provision
  fresh infra under the new account rather than transferring the existing
  project — Alpine's Workspace likely has a Domain Restricted Sharing org
  policy blocking outside IAM grants, and the OAuth consent screen needs
  re-branding/re-verification under the new domain regardless. Provisioning
  fresh means:
  - New GCP project under the new Cadence account.
  - Redeploy Cloud Run (`outreach` service) from the same repo/source.
  - New Cloud Tasks queue + Cloud Scheduler, new KMS key.
  - Migrate Firestore data via `gcloud firestore export` / `import`.
  - New OAuth consent screen under the new domain (existing test users will
    need to reconnect Gmail once — acceptable pre-launch).
  - Run OAuth verification + CASA assessment fresh on the new project
    (needed anyway before SIGNUP_MODE=open, so no wasted work).
- Alternative (not recommended): transfer the existing GCP project/org via
  `gcloud projects move` + IAM — requires Alpine org-admin cooperation,
  fights domain-restricted-sharing policy, and still requires re-branding
  the OAuth consent screen for the new domain.

Not being worked on yet — revisit once the domain is bought.

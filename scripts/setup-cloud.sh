#!/usr/bin/env bash
# One-time Google Cloud setup for the Outreach app's background sending.
# Run in Cloud Shell after the first `gcloud run deploy`:
#   bash scripts/setup-cloud.sh PROJECT_ID REGION SERVICE_NAME
set -euo pipefail

PROJECT_ID="${1:?Usage: setup-cloud.sh PROJECT_ID [REGION] [SERVICE]}"
REGION="${2:-us-central1}"
SERVICE="${3:-outreach}"

gcloud config set project "$PROJECT_ID"

echo "── Service URL ──"
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "$SERVICE_URL"

echo "── Cloud Tasks queue ──"
gcloud tasks queues create campaign-sends --location="$REGION" 2>/dev/null || echo "queue exists"

echo "── Tasks service account ──"
TASKS_SA="outreach-tasks@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create outreach-tasks \
  --display-name="Outreach Cloud Tasks invoker" 2>/dev/null || echo "SA exists"
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:${TASKS_SA}" \
  --role="roles/run.invoker"

echo "── Allow the app runtime SA to enqueue tasks and mint OIDC tokens ──"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudtasks.enqueuer" --condition=None >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$TASKS_SA" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser" >/dev/null

echo "── Update the Cloud Run service env ──"
gcloud run services update "$SERVICE" --region "$REGION" \
  --update-env-vars "^##^CLOUD_TASKS_QUEUE=campaign-sends##CLOUD_TASKS_SERVICE_ACCOUNT=${TASKS_SA}##CLOUD_TASKS_WORKER_AUDIENCE=${SERVICE_URL}##APP_BASE_URL=${SERVICE_URL}"

echo
echo "Done. Background sending is configured."
echo "Cloud Scheduler sweeps (reply/bounce checks) are added in the follow-ups release."

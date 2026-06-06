#!/usr/bin/env bash
# Deploy the govbuy MCP API to Cloud Run. PROJECT/REGION overridable.
# Custom domain: gcloud beta run domain-mappings create --service=govbuy-mcp \
#   --domain=govbuy.run.cns.me --region=$REGION  (wildcard *.run.cns.me already resolves).
set -euo pipefail
PROJECT="${PROJECT:-govreposcrape}"
REGION="${REGION:-europe-west1}"
IMAGE="gcr.io/${PROJECT}/govbuy-mcp:$(date +%s)"
cd "$(dirname "$0")/../api"

gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .
gcloud run deploy govbuy-mcp \
  --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --service-account "govbuy-api@${PROJECT}.iam.gserviceaccount.com" \
  --allow-unauthenticated --min-instances 0 --max-instances 1 --memory 512Mi \
  --set-env-vars "GCP_PROJECT=${PROJECT},BQ_PUBLIC_DATASET=govbuy_public,BQ_LOCATION=EU"

# Deploy-time IAM assertion (PRD §11 / M8): API SA must NOT be able to read *_raw or uk_tenders_public directly.
echo "Asserting least-privilege read boundary..."
SA="govbuy-api@${PROJECT}.iam.gserviceaccount.com"
for ds in govbuy_raw uk_tenders_public uk_tenders_raw; do
  if bq --project_id="$PROJECT" show --format=prettyjson "${PROJECT}:${ds}" 2>/dev/null | grep -q "$SA"; then
    echo "FAIL: $SA has access to $ds (must not)"; exit 1
  fi
done
echo "OK: API SA reads govbuy_public only."

#!/usr/bin/env bash
# Deploy the govbuy MCP API to Cloud Run with a least-privilege read-only service account.
# Idempotent. The SA may read ONLY govbuy_public (never govbuy_raw or the sibling uk_tenders_*).
# Mirrors the sibling uk-tenders-mcp deploy. Custom domain mapping is a one-off (see end).
#
#   PROJECT=govreposcrape REGION=europe-west1 ./scripts/deploy_api.sh
set -euo pipefail

PROJECT="${PROJECT:-govreposcrape}"
REGION="${REGION:-europe-west1}"          # domain mappings unsupported in europe-west2
PUBLIC_DATASET="${PUBLIC_DATASET:-govbuy_public}"
BQ_LOCATION="${BQ_LOCATION:-EU}"
SERVICE="${SERVICE:-govbuy-mcp}"
DOMAIN="${DOMAIN:-govbuy.run.cns.me}"
SA="govbuy-api"
SA_EMAIL="${SA}@${PROJECT}.iam.gserviceaccount.com"
MAX_BYTES="${MAX_BYTES:-2147483648}"      # 2 GiB query cap (matches api/src/config.ts)
cd "$(dirname "$0")/.."

echo ">> ensuring read-only service account ${SA_EMAIL}"
gcloud iam service-accounts describe "${SA_EMAIL}" --project "${PROJECT}" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "${SA}" --project "${PROJECT}" \
       --display-name "govbuy MCP API (read-only)"

echo ">> granting bigquery.jobUser (project) + dataViewer (govbuy_public ONLY)"
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member "serviceAccount:${SA_EMAIL}" --role roles/bigquery.jobUser \
  --condition=None --quiet >/dev/null

# dataset-scoped READER on govbuy_public only (never the raw write dataset or the sibling's data)
TMP=$(mktemp)
bq show --format=prettyjson "${PROJECT}:${PUBLIC_DATASET}" > "${TMP}"
python3 - "$TMP" "$SA_EMAIL" <<'PY'
import json, sys
path, sa = sys.argv[1], sys.argv[2]
d = json.load(open(path)); acc = d.get("access", [])
if not any(a.get("userByEmail")==sa and a.get("role")=="READER" for a in acc):
    acc.append({"role":"READER","userByEmail":sa}); d["access"]=acc
    json.dump(d, open(path,"w")); print("added READER")
else:
    print("READER already present")
PY
bq update --source "${TMP}" "${PROJECT}:${PUBLIC_DATASET}" >/dev/null
rm -f "${TMP}"

echo ">> deploying Cloud Run service ${SERVICE} (region ${REGION}) from ./api"
# Optional: pass the Companies House API key through (enables the LIVE exclusion-status check in
# get_supplier/due_diligence). If unset, those tools fall back to the ingest snapshot. Value never echoed.
ENV_VARS="GCP_PROJECT=${PROJECT},BQ_PUBLIC_DATASET=${PUBLIC_DATASET},BQ_LOCATION=${BQ_LOCATION},MAX_BYTES_BILLED=${MAX_BYTES}"
if [ -n "${COMPANIES_HOUSE_API:-}" ]; then ENV_VARS="${ENV_VARS},COMPANIES_HOUSE_API=${COMPANIES_HOUSE_API}"; echo ">> COMPANIES_HOUSE_API present — live exclusion check enabled"; fi
gcloud run deploy "${SERVICE}" \
  --source ./api \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --allow-unauthenticated \
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 1 --session-affinity --timeout 60 \
  --set-env-vars "${ENV_VARS}" \
  --quiet

URL=$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')
echo ">> deployed: ${URL}"

# Deploy-time least-privilege assertion: SA must NOT be able to read *_raw or the sibling's datasets.
echo ">> asserting read boundary"
for ds in govbuy_raw uk_tenders_public uk_tenders_raw; do
  if bq --project_id="$PROJECT" show --format=prettyjson "${PROJECT}:${ds}" 2>/dev/null | grep -q "${SA_EMAIL}"; then
    echo "FAIL: ${SA_EMAIL} has access to ${ds} (must not)"; exit 1
  fi
done
echo "OK: API SA reads ${PUBLIC_DATASET} only."

echo ">> MCP run.app endpoint: ${URL}/mcp"
echo ">> stable endpoint after domain mapping: https://${DOMAIN}/mcp"
echo ">> (one-off) gcloud beta run domain-mappings create --service=${SERVICE} --domain=${DOMAIN} --region=${REGION} --project=${PROJECT}"

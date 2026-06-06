#!/usr/bin/env bash
# Build + run the govbuy MCP API locally against BigQuery (needs ADC: gcloud auth application-default login).
set -euo pipefail
cd "$(dirname "$0")/../api"
npm install --no-audit --no-fund
npm run build
GCP_PROJECT="${GCP_PROJECT:-govreposcrape}" \
BQ_PUBLIC_DATASET="${BQ_PUBLIC_DATASET:-govbuy_public}" \
BQ_LOCATION="${BQ_LOCATION:-EU}" \
PORT="${PORT:-8080}" \
  node dist/index.js

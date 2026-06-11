-- Semantic search setup for find_services (run once; idempotent-ish).
-- Embeds every catalogue listing with Vertex text-embedding-005 via a BigQuery remote model, so
-- find_services can VECTOR_SEARCH by MEANING (e.g. "transcribe meetings" -> Minute / Transkriptor)
-- and blend that with keyword scoring. The API service account reads the model + service_embedding
-- and runs the query-time embedding; the connection's SA makes the Vertex call.
--
-- One-time IAM (run in shell, not SQL):
--   bq mk --connection --location=EU --project_id=govreposcrape --connection_type=CLOUD_RESOURCE govbuy_embed
--   CONN_SA=$(bq show --format=prettyjson --connection govreposcrape.EU.govbuy_embed | jq -r .cloudResource.serviceAccountId)
--   gcloud projects add-iam-policy-binding govreposcrape --member="serviceAccount:$CONN_SA"               --role=roles/aiplatform.user --condition=None
--   gcloud projects add-iam-policy-binding govreposcrape --member="serviceAccount:govbuy-api@govreposcrape.iam.gserviceaccount.com" --role=roles/bigquery.connectionUser --condition=None
--   gcloud projects add-iam-policy-binding govreposcrape --member="serviceAccount:govbuy-api@govreposcrape.iam.gserviceaccount.com" --role=roles/aiplatform.user        --condition=None

-- The remote embedding model (lives in govbuy_public so the read-only API SA can use it).
CREATE OR REPLACE MODEL `govbuy_public.embed`
REMOTE WITH CONNECTION `govreposcrape.EU.govbuy_embed`
OPTIONS (ENDPOINT = 'text-embedding-005');

-- Embed every listing (name + description). Rebuild after a catalogue refresh.
CREATE OR REPLACE TABLE `govbuy_public.service_embedding` AS
SELECT service_id, ml_generate_embedding_result AS embedding
FROM ML.GENERATE_EMBEDDING(
  MODEL `govbuy_public.embed`,
  (SELECT service_id, SUBSTR(CONCAT(name, '. ', IFNULL(description, '')), 0, 8000) AS content
   FROM `govbuy_public.service`),
  STRUCT(TRUE AS flatten_json_output))
WHERE ARRAY_LENGTH(ml_generate_embedding_result) = 768;

-- An IVF index exists for cost, but find_services forces use_brute_force=true: at 117k rows a brute
-- scan is cheap and gives full recall (the IVF approximation misses weak-similarity (~0.6) matches).
CREATE VECTOR INDEX IF NOT EXISTS svc_emb_idx ON `govbuy_public.service_embedding`(embedding)
OPTIONS (index_type = 'IVF', distance_type = 'COSINE');

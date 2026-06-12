-- pipeline_notice.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Materialises govbuy_public.pipeline_notice from the sibling tenders corpus.
-- Source: govreposcrape.uk_tenders_public.compiled_process
--   tender.status IN ('planned','planning')  = FORWARD/pipeline notices only.
-- Authorised-view boundary: this table lives in govbuy_public (read by the API
-- SA); it does NOT re-expose contactPoint or any PII field.
-- ─────────────────────────────────────────────────────────────────────────────
-- Build:
--   bq query --use_legacy_sql=false --project_id=govreposcrape --location=EU \
--     < sql/pipeline_notice.sql
-- Re-run whenever compiled_process is refreshed.  Safe to re-run (CREATE OR
-- REPLACE overwrites atomically; no staging-table swap needed for this view).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE TABLE `govreposcrape.govbuy_public.pipeline_notice`
CLUSTER BY cpv_division, expected_date
AS
SELECT
  -- ── Core identity ──────────────────────────────────────────────────────────
  ocid,
  buyer_name,
  title,
  cpv_division,

  -- ── Estimated value (GBP; NULL where not published) ───────────────────────
  -- Uses the top-level value_amount column (already extracted by the ingestion
  -- pipeline from tender.value.amount). Currency is implicitly GBP for all
  -- FTS/CF records; cross-currency amounts are rare and not normalised here.
  value_amount                                                          AS estimated_value,

  -- ── Best-available forward date ────────────────────────────────────────────
  -- Priority:
  --   1. tender.tenderPeriod.startDate  — rare but most precise (tender opens)
  --   2. tender.communication.futureNoticeDate — the declared intent-to-publish
  --      date; populated for ~55% of planned records
  --   3. tender.contractPeriod.startDate — when the contract is expected to
  --      start; populated for ~15% where futureNoticeDate is absent
  --   4. published_date — the notice publication date (always present; used as
  --      a last resort so the column is never NULL)
  -- SAFE.PARSE_TIMESTAMP handles the mix of UTC ("Z") and offset-aware ISO-8601
  -- strings present in the raw JSON without erroring on malformed values.
  COALESCE(
    SAFE.PARSE_TIMESTAMP(
      '%Y-%m-%dT%H:%M:%E*S%Ez',
      JSON_VALUE(compiled_json, '$.tender.tenderPeriod.startDate')),
    SAFE.PARSE_TIMESTAMP(
      '%Y-%m-%dT%H:%M:%E*S%Ez',
      JSON_VALUE(compiled_json, '$.tender.communication.futureNoticeDate')),
    SAFE.PARSE_TIMESTAMP(
      '%Y-%m-%dT%H:%M:%E*S%Ez',
      JSON_VALUE(compiled_json, '$.tender.contractPeriod.startDate')),
    published_date
  )                                                                     AS expected_date,

  -- ── Provenance ─────────────────────────────────────────────────────────────
  source,           -- fts | contracts_finder | ...
  official_url,

  -- ── Keyword search haystack ────────────────────────────────────────────────
  -- Lowercased concatenation of title + description.  Tool handlers run a
  -- simple LIKE '%keyword%' or REGEXP_CONTAINS against this column.
  -- NULL-safe: IFNULL coalesces to empty string before concat.
  LOWER(CONCAT(IFNULL(title, ''), ' ', IFNULL(description, '')))        AS hay

FROM `govreposcrape.uk_tenders_public.compiled_process`
WHERE JSON_VALUE(compiled_json, '$.tender.status') IN ('planned', 'planning');

-- ─────────────────────────────────────────────────────────────────────────────
-- Post-build smoke tests (run manually after CREATE OR REPLACE succeeds):
--
--   -- 1. Total row count (expect ~29 k as of June 2026; grows with corpus)
--   SELECT COUNT(*) AS total_rows
--   FROM `govreposcrape.govbuy_public.pipeline_notice`;
--
--   -- 2. IT/software planned notices (cpv_division = '72')
--   SELECT COUNT(*) AS it_rows
--   FROM `govreposcrape.govbuy_public.pipeline_notice`
--   WHERE cpv_division = '72';
--   -- expect ~1 700
--
--   -- 3. Sample of recent IT notices
--   SELECT ocid, buyer_name, title, estimated_value, expected_date, official_url
--   FROM `govreposcrape.govbuy_public.pipeline_notice`
--   WHERE cpv_division = '72'
--   ORDER BY expected_date DESC
--   LIMIT 10;
-- ─────────────────────────────────────────────────────────────────────────────

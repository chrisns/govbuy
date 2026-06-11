-- supplier_call_off_track_record.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Reusable subquery: for each service's supplier_name, return their call-off
-- track record from sibling_call_off_awards.
--
-- Two modes (controlled by the WHERE clause / join predicate on rm_stem):
--   • Framework-scoped : aa.rm_stem = 'RM1557'   (G-Cloud example)
--   • Overall (all fwks): omit the rm_stem filter (use award_agg_overall below)
--
-- Join key  : NORM(service.supplier_name) = award_agg.norm_supplier_name
-- NORM strips legal suffixes (ltd/limited/plc/llp/inc/corp/llc/gmbh/bv …),
--            lowercases, collapses punctuation → space, trims whitespace.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Normalisation UDF (define once per query) ─────────────────────────────
CREATE TEMP FUNCTION NORM(s STRING) AS (
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        LOWER(TRIM(s)),
        -- strip trailing legal-form tokens
        r'\b(ltd\.?|limited|plc\.?|llp\.?|inc\.?|corp\.?|llc\.?|gmbh|bv|b\.v\.|s\.a\.|s\.l\.)$',
        ''
      ),
      r'[^a-z0-9\s]',   -- collapse punctuation → space
      ' '
    ),
    r'\s+',             -- collapse repeated spaces
    ' '
  ))
);

-- ── 2a. Framework-scoped aggregation ─────────────────────────────────────────
-- Groups awards by (normalised supplier name, RM stem).
-- RM stem = the numeric-only root, e.g. 'RM1557' for all G-Cloud sub-lots.
WITH award_agg AS (
  SELECT
    NORM(supplier_name)                                AS norm_supplier_name,
    REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]+')   AS rm_stem,
    SUM(award_amount)                                  AS total_award_gbp,
    COUNT(*)                                           AS call_off_count,
    COUNTIF(is_framework_call_off)                     AS framework_call_off_count
  FROM `govreposcrape.govbuy_public.sibling_call_off_awards`
  WHERE award_currency = 'GBP'
    AND award_amount IS NOT NULL
  GROUP BY norm_supplier_name, rm_stem
)

-- ── 3. Join to services ───────────────────────────────────────────────────────
-- Replace the subquery below with your actual services CTE / table reference.
-- The only requirement: your CTE must expose a `supplier_name` column.
SELECT
  svc.service_id,
  svc.name        AS service_name,
  svc.supplier_name,
  aa.rm_stem,
  aa.total_award_gbp,
  aa.call_off_count,
  aa.framework_call_off_count,
  -- Human-readable snippet for surface in find_services results:
  CONCAT(
    'Won £', FORMAT('%,.0f', aa.total_award_gbp),
    ' across ', aa.call_off_count,
    ' call-off', IF(aa.call_off_count = 1, '', 's'),
    ' (', aa.rm_stem, ')'
  ) AS track_record_label
FROM `govreposcrape.govbuy_public.service` svc
JOIN award_agg aa
  ON NORM(svc.supplier_name) = aa.norm_supplier_name
 -- ↓ remove or parameterise this line for cross-framework ("overall") mode
 AND aa.rm_stem = REGEXP_EXTRACT(UPPER(svc.instrument_id), r'RM[0-9]+')
WHERE svc.catalogue = 'g-cloud'
  AND svc.supplier_name IS NOT NULL
ORDER BY aa.total_award_gbp DESC
LIMIT 20;


-- ── 2b. Overall (cross-framework) aggregation variant ────────────────────────
-- Use this CTE instead of award_agg when you want totals across ALL frameworks.
--
-- WITH award_agg_overall AS (
--   SELECT
--     NORM(supplier_name)   AS norm_supplier_name,
--     SUM(award_amount)     AS total_award_gbp,
--     COUNT(*)              AS call_off_count,
--     COUNTIF(is_framework_call_off) AS framework_call_off_count
--   FROM `govreposcrape.govbuy_public.sibling_call_off_awards`
--   WHERE award_currency = 'GBP'
--     AND award_amount IS NOT NULL
--   GROUP BY norm_supplier_name
-- )
-- … then join on NORM(svc.supplier_name) = award_agg_overall.norm_supplier_name
--   (no rm_stem predicate).

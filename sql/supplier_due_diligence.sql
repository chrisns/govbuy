-- ── Supplier Due-Diligence Profile ──────────────────────────────────────────
-- One row per supplier: call-off spend/count, buyer diversity, customer
-- concentration (top buyer % of call-off £), channel mix (competitive signal),
-- CPV footprint, and contract date bookends.
--
-- Parameter
--   @crn  STRING  Companies House CRN  e.g. "02174990" (Softcat)
--
-- Spend definitions used
--   call-off spend  : channel IN ('framework_call_off','dps_call_off')
--                     AND award_amount BETWEEN 0 AND 100_000_000
--                     (eliminates framework-ceiling outliers)
--   channel mix     : all rows for this supplier (no amount cap)
--                     — reveals whether wins are competitive or directed
--
-- Run:
--   bq query --use_legacy_sql=false \
--            --project_id=govreposcrape --location=EU \
--            --parameter='crn:STRING:02174990' \
--            < sql/supplier_due_diligence.sql
-- ────────────────────────────────────────────────────────────────────────────

WITH

-- 1. Base rows for this supplier, flag call-off tier
base AS (
  SELECT
    UPPER(buyer_name)  AS buyer_norm,          -- normalise case for grouping
    channel,
    cpv_division,
    award_amount,
    award_date,
    contract_end_date,
    CASE
      WHEN channel IN ('framework_call_off', 'dps_call_off')
           AND award_amount BETWEEN 0 AND 100000000 THEN TRUE
      ELSE FALSE
    END AS is_calloff
  FROM `govreposcrape.govbuy_public.tender_award`
  WHERE supplier_crn = @crn
),

-- 2. Call-off totals
calloff AS (
  SELECT
    COUNT(*)                    AS calloff_count,
    ROUND(SUM(award_amount), 2) AS calloff_spend_gbp,
    COUNT(DISTINCT buyer_norm)  AS calloff_distinct_buyers
  FROM base
  WHERE is_calloff
),

-- 3. Buyer concentration — rank buyers and compute grand total in one pass
buyer_ranked AS (
  SELECT
    buyer_norm,
    SUM(award_amount)                             AS buyer_spend,
    SUM(SUM(award_amount)) OVER ()                AS grand_total,
    RANK() OVER (ORDER BY SUM(award_amount) DESC) AS rnk
  FROM base
  WHERE is_calloff
  GROUP BY buyer_norm
),

top_buyer AS (
  SELECT
    buyer_norm                                 AS top_buyer,
    ROUND(buyer_spend, 2)                      AS top_buyer_spend,
    ROUND(buyer_spend / grand_total * 100, 1)  AS top_buyer_pct
  FROM buyer_ranked
  WHERE rnk = 1
),

-- 4. Channel mix (all rows) — framework/DPS vs open competition vs direct award
channel_mix AS (
  SELECT
    COUNT(*) AS total_awards,
    ROUND(COUNTIF(channel = 'framework_call_off') / COUNT(*) * 100, 1) AS pct_framework_calloff,
    ROUND(COUNTIF(channel = 'dps_call_off')       / COUNT(*) * 100, 1) AS pct_dps_calloff,
    ROUND(COUNTIF(channel = 'open')               / COUNT(*) * 100, 1) AS pct_open,
    ROUND(COUNTIF(channel = 'direct')             / COUNT(*) * 100, 1) AS pct_direct,
    ROUND(COUNTIF(channel = 'other')              / COUNT(*) * 100, 1) AS pct_other
  FROM base
),

-- 5. CPV footprint (call-off only, top 8 divisions by spend)
cpv_spend AS (
  SELECT
    STRING_AGG(
      CONCAT(
        cpv_division, ': £', CAST(ROUND(div_spend / 1e6, 2) AS STRING),
        'm (', CAST(award_cnt AS STRING), ' awards)'
      ),
      ' | '
      ORDER BY div_spend DESC
      LIMIT 8
    ) AS cpv_footprint
  FROM (
    SELECT
      COALESCE(cpv_division, 'unknown') AS cpv_division,
      ROUND(SUM(award_amount), 2)       AS div_spend,
      COUNT(*)                          AS award_cnt
    FROM base
    WHERE is_calloff
    GROUP BY cpv_division
  )
),

-- 6. Date bookends
dates AS (
  SELECT
    MAX(award_date)        AS last_award_date,
    MIN(contract_end_date) AS earliest_contract_end,
    MAX(contract_end_date) AS latest_contract_end
  FROM base
)

-- ── Final single-row output ──────────────────────────────────────────────────
SELECT
  @crn                          AS crn,
  -- Call-off activity
  c.calloff_count,
  c.calloff_spend_gbp,
  c.calloff_distinct_buyers,
  -- Customer concentration
  t.top_buyer,
  t.top_buyer_spend,
  t.top_buyer_pct               AS top_buyer_pct_of_calloff,
  -- Channel mix (competitive signal)
  m.total_awards,
  m.pct_framework_calloff,
  m.pct_dps_calloff,
  m.pct_open,
  m.pct_direct,
  m.pct_other,
  -- CPV footprint
  p.cpv_footprint,
  -- Date bookends
  d.last_award_date,
  d.earliest_contract_end,
  d.latest_contract_end
FROM calloff      c
CROSS JOIN top_buyer   t
CROSS JOIN channel_mix m
CROSS JOIN cpv_spend   p
CROSS JOIN dates       d

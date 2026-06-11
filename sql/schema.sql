-- govbuy — BigQuery schema (ADR-0001/0002/0003/0004). Location: EU.
-- Two datasets enforce a least-privilege read boundary:
--   govbuy_raw    : WRITE — doc archive manifest, generic extracted-fact event log, evidence,
--                   frontier registry, run ledger, supplier-match cache. Ingestion identity only.
--   govbuy_public : READ — typed, verbatim, source-anchored query-serving tables + the sibling
--                   authorized view. The API read-only SA sees ONLY this dataset (never *_raw,
--                   and NOT the sibling's uk_tenders_public directly — see the authorized view).
-- Build: bq query --use_legacy_sql=false < sql/schema.sql  (datasets created by Terraform/--bootstrap).
-- Enums are documented in comments (BigQuery does not enforce them; the harness validates on write).
-- Idempotency: every raw row carries content_hash = SHA-256 over a canonicalised (RFC 8785 JCS)
-- payload; loads MERGE on content_hash. Public tables are build-and-swap (staging + atomic table
-- replace), so readers never see a half-recompute and a failed run keeps the last good public dataset.

-- ============================================================================
-- RAW (write) — govbuy_raw
-- ============================================================================

-- Manifest of every fetched source document; the GCS object is the replay source.
CREATE TABLE IF NOT EXISTS `govbuy_raw.document` (
  document_id   STRING    NOT NULL,             -- = content_hash of the fetched bytes
  source_id     STRING    NOT NULL,             -- FK frontier.source_id
  operator_id   STRING,                          -- FK operator.operator_id (NULL until classified)
  url           STRING    NOT NULL,
  gcs_uri       STRING    NOT NULL,              -- archived raw bytes (excerpt substring-checked against this)
  content_type  STRING,                          -- text/html | application/pdf | xlsx | json
  http_status   INT64,
  robots_ok     BOOL,                            -- robots.txt + per-source ToS gate passed
  licence       STRING,                          -- ogl | crown | operator_tos | supplier_tos | unknown
  fetched_at    TIMESTAMP NOT NULL,
  load_run_id   STRING    NOT NULL               -- FK harness_run.run_id
)
PARTITION BY DATE(fetched_at)
CLUSTER BY source_id, operator_id;

-- Append-only generic fact event log: one row per extracted fact, with its evidence + verify state.
-- Public typed tables are projected from verify_status='verified' rows. Idempotent MERGE on content_hash.
CREATE TABLE IF NOT EXISTS `govbuy_raw.extracted_fact` (
  content_hash    STRING    NOT NULL,            -- SHA-256(JCS(fact_type + subject_ref + payload))
  fact_id         STRING    NOT NULL,
  run_id          STRING    NOT NULL,            -- FK harness_run.run_id
  document_id     STRING    NOT NULL,            -- FK document.document_id
  fact_type       STRING    NOT NULL,            -- operator | instrument | lot | award_mechanic |
                                                 -- buying_doc | appointment_observation | supplier |
                                                 -- reseller_channel | inbound_scope
  subject_ref     STRING,                         -- natural key of the entity this fact is about
  payload         STRING    NOT NULL,            -- JSON text of the typed fields for fact_type (PARSE_JSON on read)
  evidence_id     STRING    NOT NULL,            -- FK claim_evidence.evidence_id (source-anchor; NOT NULL)
  confidence      FLOAT64   NOT NULL,            -- 0..1
  verify_status   STRING    NOT NULL,            -- pending | verified | quarantined
  verbatim_ok     BOOL      NOT NULL,            -- excerpt found verbatim in document (deterministic gate, B6)
  quarantine_reason STRING,                       -- set when verify_status='quarantined'
  loaded_at       TIMESTAMP NOT NULL,
  load_date       DATE      NOT NULL
)
PARTITION BY load_date
CLUSTER BY fact_type, run_id, document_id;

-- Source-anchor rows. excerpt MUST be a whitespace-normalised verbatim substring of the document
-- at `locator` (enforced by the harness before verbatim_ok=TRUE; tested by the source-anchoring test).
CREATE TABLE IF NOT EXISTS `govbuy_raw.claim_evidence` (
  evidence_id   STRING    NOT NULL,
  document_id   STRING    NOT NULL,             -- FK document.document_id
  source_url    STRING    NOT NULL,
  source_kind   STRING    NOT NULL,             -- gca_page | operator_site | supplier_site | ocds_notice | pdf | xlsx
  excerpt       STRING,                          -- short quotation (kept minimal; quotation-exception sized)
  locator       STRING,                          -- page/xpath/cell anchor within the document
  licence       STRING    NOT NULL,             -- ogl | crown | operator_tos | supplier_tos | unknown
  retrieved_on  TIMESTAMP NOT NULL,
  confidence    FLOAT64
);

-- Frontier registry — the "add an operator = configuration not code" surface (ADR-0002, M4).
CREATE TABLE IF NOT EXISTS `govbuy_raw.frontier` (
  source_id     STRING    NOT NULL,
  operator_id   STRING,
  seed_url      STRING    NOT NULL,
  recipe        STRING    NOT NULL,             -- JSON text: {target_fact_types[], fetch:{pagination,follow}, extractor_prompt_id, extractor_prompt_version, locator_strategy, tos_gate}
  cadence_hint  STRING,                          -- nightly | weekly | monthly
  enabled       BOOL      NOT NULL,
  status        STRING,                          -- proposed | active | broken | retired
  last_refreshed TIMESTAMP
)
CLUSTER BY operator_id, status;

-- One row per harness run: health + COST ledger (ADR-0005, mandatory cost reporting).
CREATE TABLE IF NOT EXISTS `govbuy_raw.harness_run` (
  run_id          STRING    NOT NULL,
  mode            STRING    NOT NULL,           -- refresh | discover | backfill
  started_at      TIMESTAMP NOT NULL,
  finished_at     TIMESTAMP,
  status          STRING    NOT NULL,           -- running | success | failed | paused_ceiling
  operators       ARRAY<STRING>,
  docs_seen       INT64,
  facts_committed INT64,
  facts_quarantined INT64,
  tokens_in       INT64,
  tokens_out      INT64,
  est_gbp         NUMERIC,
  model_tier_breakdown ARRAY<STRUCT<tier STRING, tokens_in INT64, tokens_out INT64, est_gbp NUMERIC>>,
  by_operator     ARRAY<STRUCT<operator_id STRING, est_gbp NUMERIC>>,  -- £-per-operator (PRD §7.2)
  ceiling_gbp     NUMERIC,                        -- the soft ceiling in force this run
  error_summary   STRING
)
PARTITION BY DATE(started_at)
CLUSTER BY mode, status;

-- Supplier name -> Companies House resolution cache (match-only + point-in-time snapshot; ADR-0001).
CREATE TABLE IF NOT EXISTS `govbuy_raw.supplier_match` (
  source_name_norm STRING  NOT NULL,            -- normalised trading name (match key)
  company_number   STRING,                       -- NULL = unresolved (kept, with reason)
  registered_name  STRING,
  match_confidence FLOAT64,
  match_band       STRING,                       -- auto_accept | quarantine | reject | unresolved
  status_at_match  STRING,                       -- active | dissolved | liquidation | ... (snapshot)
  matched_on       TIMESTAMP,
  method           STRING,                        -- coh_id_present | publisher_cluster | fuzzy_name
  publisher_ids    ARRAY<STRING>,                 -- GB-FTS-* / GB-CFS-* clusters that map here
  unresolved_reason STRING
)
CLUSTER BY company_number;

-- ============================================================================
-- PUBLIC (read, query-serving) — govbuy_public
-- Typed, verbatim, source-anchored projection of verify_status='verified' facts.
-- Every fact table's evidence_id is a NOT NULL FK to claim_evidence (AC-6).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `govbuy_public.claim_evidence` (
  evidence_id   STRING NOT NULL,                 -- public projection (drops nothing material; keeps excerpt+url+conf)
  source_url    STRING NOT NULL,
  source_kind   STRING NOT NULL,                 -- gca_page | operator_site | supplier_site | ocds_notice | pdf | xlsx
  excerpt       STRING,
  licence       STRING NOT NULL,
  confidence    FLOAT64,
  retrieved_on  TIMESTAMP NOT NULL
)
CLUSTER BY source_kind;

CREATE TABLE IF NOT EXISTS `govbuy_public.operator` (
  operator_id   STRING NOT NULL,
  name          STRING NOT NULL,
  kind          STRING NOT NULL,                 -- gca | la_pbo | nhs | consortium | managed_marketplace | other
  funding_model STRING,                           -- rebate_levy | management_fee | other
  home_url      STRING,
  status        STRING,                           -- active | inactive
  evidence_id   STRING NOT NULL                   -- FK claim_evidence
)
CLUSTER BY kind;

CREATE TABLE IF NOT EXISTS `govbuy_public.instrument` (
  instrument_id    STRING NOT NULL,
  operator_id      STRING NOT NULL,               -- FK operator
  name             STRING NOT NULL,
  rm_reference     STRING,                         -- e.g. RM1557.14 (NULL for non-GCA)
  type             STRING NOT NULL,               -- closed_framework | open_framework | dynamic_market | legacy_dps
  regime           STRING NOT NULL,               -- pca2023 | legacy
  lifecycle_status STRING NOT NULL,               -- live_for_call_off | closed_to_new_call_off | expired
  starts_on        DATE,
  expires_on       DATE,
  predecessor_id   STRING,                         -- prior iteration (G-Cloud 13 -> 14 -> 15)
  category_tags    ARRAY<STRING>,
  official_url     STRING NOT NULL,
  evidence_id      STRING NOT NULL
)
CLUSTER BY operator_id, type, lifecycle_status;

CREATE TABLE IF NOT EXISTS `govbuy_public.lot` (
  lot_id        STRING NOT NULL,
  instrument_id STRING NOT NULL,                  -- FK instrument
  number        STRING,
  title         STRING NOT NULL,
  scope         STRING,
  category_tags ARRAY<STRING>,
  evidence_id   STRING NOT NULL
)
CLUSTER BY instrument_id;

CREATE TABLE IF NOT EXISTS `govbuy_public.award_mechanic` (
  instrument_id STRING NOT NULL,                  -- FK instrument
  lot_id        STRING,                            -- NULL = instrument-wide
  mechanic      STRING NOT NULL,                  -- call_off_no_further_competition | further_competition | competitive_flexible_procedure
  permitted     BOOL   NOT NULL,
  conditions    STRING,
  evidence_id   STRING NOT NULL
)
CLUSTER BY instrument_id;

CREATE TABLE IF NOT EXISTS `govbuy_public.buying_doc` (
  doc_id        STRING NOT NULL,
  instrument_id STRING NOT NULL,                  -- FK instrument
  lot_id        STRING,
  doc_type      STRING NOT NULL,                  -- call_off_schedule | order_form | buyer_guide | required_documents | other
  title         STRING,
  url           STRING,
  required_for_purchase BOOL,
  summary       STRING,
  evidence_id   STRING NOT NULL
)
CLUSTER BY instrument_id;

-- B5: the EVIDENCED grain — one row per (instrument,lot,supplier,source) observation, each with its
-- own evidence + confidence + observed_on + whether the supplier was observed present or absent.
-- Conflicts between sources live here as differing rows (ADR-0003 "surfaced, not merged").
-- MERGE key: (instrument_id, lot_id, supplier_id, source_id, observed_on). Clustered-only (no
-- partitioning) to avoid the partition-modification quota on bulk build-and-swap (sibling precedent).
CREATE TABLE IF NOT EXISTS `govbuy_public.appointment_observation` (
  instrument_id   STRING NOT NULL,
  lot_id          STRING,
  supplier_id     STRING NOT NULL,               -- FK supplier
  source_id       STRING NOT NULL,
  observed_on     DATE   NOT NULL,
  observed_present BOOL  NOT NULL,               -- TRUE = listed; FALSE = confirmed absent on a refresh
  confidence      FLOAT64 NOT NULL,
  evidence_id     STRING NOT NULL
)
CLUSTER BY instrument_id, lot_id, supplier_id;

-- The RESOLVED edge — derived window + conflict flag, built from observations. This is what tools read.
-- left_on is set when the latest observation across sources is observed_present=FALSE (or absent for
-- > staleness window). conflict=TRUE when concurrent sources disagree on presence.
CREATE TABLE IF NOT EXISTS `govbuy_public.appointed_supplier` (
  instrument_id  STRING NOT NULL,
  lot_id         STRING,
  supplier_id    STRING NOT NULL,                -- FK supplier
  appointed_from DATE,                            -- earliest observed_present
  last_seen_on   DATE   NOT NULL,
  left_on        DATE,                            -- derived; NULL = still appointed
  status         STRING NOT NULL,                -- active | left | unconfirmed | conflicted
  confidence     FLOAT64 NOT NULL,               -- aggregate
  conflict       BOOL   NOT NULL,
  evidence_ids   ARRAY<STRING>                   -- contributing observation evidence (BQ stores NULL arrays as empty; harness guarantees >=1)
)
CLUSTER BY instrument_id, lot_id, supplier_id;

CREATE TABLE IF NOT EXISTS `govbuy_public.supplier` (
  supplier_id      STRING NOT NULL,              -- govbuy entity id (stable; clusters publisher ids + name)
  display_name     STRING NOT NULL,
  company_number   STRING,                        -- CRN (NULL = unresolved)
  registered_name  STRING,
  match_confidence FLOAT64,
  match_band       STRING,                        -- auto_accept | quarantine | reject | unresolved
  status_at_match  STRING,                        -- snapshot only; link out for live
  matched_on       TIMESTAMP,
  ch_url           STRING,
  publisher_ids    ARRAY<STRING>                  -- GB-FTS-* / GB-CFS-* / GB-COH-*
)
CLUSTER BY company_number;

CREATE TABLE IF NOT EXISTS `govbuy_public.reseller_channel` (
  supplier_id   STRING NOT NULL,                  -- FK supplier
  channel_type  STRING NOT NULL,                 -- thin_prime | var | vendor | hybrid | unknown
  confidence    FLOAT64 NOT NULL,
  evidence_id   STRING NOT NULL
)
CLUSTER BY channel_type;

-- Reseller/prime -> vendor it can route to market ("inbound scope"). Lowest-confidence data; short
-- excerpts only (supplier marketing pages — highest licensing risk, ADR-0004/M7).
CREATE TABLE IF NOT EXISTS `govbuy_public.inbound_scope` (
  supplier_id          STRING NOT NULL,           -- FK supplier (the reseller/prime)
  vendor_name          STRING NOT NULL,
  vendor_company_number STRING,
  confidence           FLOAT64 NOT NULL,
  evidence_id          STRING NOT NULL
)
CLUSTER BY supplier_id;

-- Per-listing service/product on a catalogue framework (G-Cloud 14 today). What a supplier actually
-- SELLS (vs. appointed_supplier = that it is merely on the framework), so capability questions
-- ("host my app", "an M365 mailbox", "a service desk") resolve to a citable listing URL. Source:
-- the public Digital Marketplace (OGL). One row per /g-cloud/services/<id>; supplier_id resolved by
-- name to the supplier table (NULL if unmatched). description/features/benefits power free-text search.
CREATE TABLE IF NOT EXISTS `govbuy_public.service` (
  service_id    STRING NOT NULL,                  -- catalogue-unique listing id (e.g. the URL path)
  catalogue     STRING,                            -- g-cloud | nhs-buying-catalogue | ndx | espo | ypo | aws | azure | gcp
  supplier_id   STRING,                            -- FK supplier (resolved by name; NULL if unmatched)
  supplier_name STRING,                            -- as published on the listing
  instrument_id STRING NOT NULL,                  -- FK instrument (g-cloud-14)
  lot           STRING,                            -- cloud-hosting | cloud-software | cloud-support
  name          STRING NOT NULL,
  description   STRING,                            -- the service summary (full, from the detail page)
  features      ARRAY<STRING>,
  benefits      ARRAY<STRING>,
  url           STRING NOT NULL,                  -- the citable /g-cloud/services/<id> listing
  evidence_id   STRING NOT NULL
)
CLUSTER BY supplier_id, lot;

-- Supplier call-off track record (materialised from the sibling award data, like sibling_call_off_awards).
-- A supplier's REAL published call-off spend per framework, keyed on a NORMALISED supplier name + RM
-- stem, so find_services can show proof-of-delivery ("won £X across N call-offs on this framework")
-- next to each catalogue listing. Built by bq.materialize_track_record(); one paid scan, cheap join.
CREATE TABLE IF NOT EXISTS `govbuy_public.supplier_track_record` (
  norm_name        STRING,                        -- normalised supplier name (lower, legal-suffix-stripped)
  rm_stem          STRING,                        -- RM reference stem, e.g. RM1557
  total_award_gbp  NUMERIC,
  call_off_count   INT64
)
CLUSTER BY norm_name;

-- Reference: payment/settlement mechanisms — is_route is ALWAYS FALSE (CONTEXT.md; payment-mechanisms.md).
CREATE TABLE IF NOT EXISTS `govbuy_public.payment_mechanism` (
  mechanism                STRING NOT NULL,        -- purchase_order_invoice | gpc | expenses | petty_cash | direct_debit | marketplace_consumption | inter_entity_recharge
  is_route                 BOOL   NOT NULL,        -- ALWAYS FALSE
  permitted_for_procurement STRING,                -- yes_default | narrow | no
  governing_source         STRING,
  notes                    STRING
);

-- Per-operator/source freshness + health (N6: green/amber/red rules below mirror sibling §8.6).
--   red   : no successful refresh of this source in >36h, or last run failed
--   amber : stale-but-degraded (ran, but flagged anomalous / partial)
--   green : recent successful run; distinguishes ran-no-new-facts from did-not-run via last_*_at
CREATE TABLE IF NOT EXISTS `govbuy_public.source_status` (
  source_id        STRING NOT NULL,
  operator_id      STRING,
  last_run_at      TIMESTAMP,
  last_success_at  TIMESTAMP,
  last_run_status  STRING,                         -- success | failed | paused_ceiling
  facts_total      INT64,
  health           STRING,                         -- green | amber | red
  spend_coverage_note STRING                        -- contribution to the spend-coverage metric
)
CLUSTER BY operator_id;

-- Public run summary so get_status can surface last-run cost + spend coverage without
-- the API SA touching the raw tier (the full ledger is govbuy_raw.harness_run).
CREATE TABLE IF NOT EXISTS `govbuy_public.run_summary` (
  run_id             STRING NOT NULL,
  mode               STRING NOT NULL,        -- refresh | discover | backfill
  finished_at        TIMESTAMP,
  status             STRING,
  docs_seen          INT64,
  facts_committed    INT64,
  est_gbp            NUMERIC,
  spend_coverage_pct NUMERIC
);

-- ============================================================================
-- AUTHORIZED VIEW (M8) — the ONLY surface onto the sibling's award data.
-- The API SA gets dataViewer on govbuy_public ONLY. This view is authorized on the sibling's
-- uk_tenders_public, so it can read it WITHOUT the API SA having direct access — and it DROPS the
-- PII-bearing parties[].contactPoint by selecting only award value + supplier identity +
-- framework-reference keys. §14 RESOLVED (docs/research/2026-06-06-framework-ref-join.md): the RM-number
-- stem is the operative instrument join key (11.2% of awarded spend); compiled_json is parsed ONLY for
-- relatedProcesses / procurementMethodDetails — contactPoint is never re-exposed.
-- query_sql joins against THIS view, not the raw sibling dataset.
-- ============================================================================
-- NOTE: the harness REPLACES this view with a MATERIALISED TABLE of the same name
-- (`govbuy-ingest materialize-sibling`) for query economy — one paid scan at ingest, cheap reads
-- after, so a 2 GiB per-query cap both protects AND lets cross-dataset joins run. Re-run
-- materialize-sibling after re-running this file. Same least-privilege boundary either way.
CREATE OR REPLACE VIEW `govbuy_public.sibling_call_off_awards` AS
SELECT
  cp.ocid,
  cp.source,
  cp.buyer_name,
  cp.cpv_division,
  cp.awarded_amount,
  cp.awarded_currency,
  cp.published_date,
  a.supplier_name,
  a.supplier_id,                                   -- GB-COH-*/GB-FTS-*/GB-CFS-* (join key, two-tier match — B3)
  a.amount        AS award_amount,
  a.currency      AS award_currency,
  cp.official_url,
  -- (1) canonical parent-framework OCID (authoritative when present; sparse)
  ( SELECT JSON_VALUE(rp,'$.identifier')
    FROM UNNEST(JSON_QUERY_ARRAY(cp.compiled_json,'$.relatedProcesses')) rp
    WHERE JSON_VALUE(rp,'$.scheme') = 'ocid'
      AND EXISTS (SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(rp,'$.relationship')) r WHERE JSON_VALUE(r) = 'framework')
    LIMIT 1 )                                                                   AS framework_ocid,
  -- (2) de-facto CCS/GCA instrument key — the operative join (RM stem; strip lot suffix to match)
  REGEXP_EXTRACT(UPPER(CONCAT(IFNULL(cp.title,''),' ',IFNULL(cp.description,''))), r'RM[0-9]{3,5}') AS rm_reference,
  -- (3) call-off flag (label only — parent unknown)
  (JSON_VALUE(cp.compiled_json,'$.tender.procurementMethodDetails') = 'Call-off from a framework agreement') AS is_framework_call_off
FROM `uk_tenders_public.compiled_process` cp, UNNEST(cp.awards) a;
-- NOTE: grant this view authorized-view access on uk_tenders_public; do NOT grant the API SA
-- dataViewer on uk_tenders_public directly. Deploy-time IAM assertion: API SA reads only the two
-- named public datasets, never any *_raw (ADR-0003 security test).

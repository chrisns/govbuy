-- Top-5 ("decisive & bulletproof") reference + materialised tables.
-- pa2023_rule: 15 sourced Procurement Act 2023 statutory rules — seeded from
--   reference-data/pa2023_rules.jsonl via `govbuy-ingest seed-reference` (reference.py).
--   Powers a statutorily-precise compliant_path. Schema:
CREATE TABLE IF NOT EXISTS `govbuy_public.pa2023_rule` (topic STRING, statement STRING, source_url STRING);
-- pipeline_notice: forward/planned procurement notices (~29k) — built by bq.materialize_fusion()
--   from compiled_process WHERE tender.status IN ('planned','planning'). Powers supplier_pipeline's
--   coming_soon section + plan_buy's pipeline_to_watch. (DDL/refresh in ingestion, not here.)

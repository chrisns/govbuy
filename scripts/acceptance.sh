#!/usr/bin/env bash
# Full acceptance run for govbuy — proves PRD §16 AC-1..AC-11 against the LIVE system + harness.
# Prereqs: MCP server on :8080 (scripts/run_local.sh), ADC, ingestion venv, Companies House key in .env.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/ingestion/.venv/bin/python"
BQ() { bq query --project_id=govreposcrape --location=EU --use_legacy_sql=false --format=csv "$@" 2>/dev/null; }
fail=0

echo "==================== govbuy acceptance (AC-1..AC-11) ===================="

echo "--- unit proofs (gate / reconcile / per-operator cost / health) ---"
PYTHONPATH="$ROOT/ingestion/src" "$PY" -m pytest "$ROOT/ingestion/tests" -q 2>&1 | tail -2

echo "--- AC-7: metered run writes per-operator £ to the harness ledger ---"
PYTHONPATH="$ROOT/ingestion/src" "$PY" - <<'PYEOF'
from govbuy_ingest.cost import CostMeter
from govbuy_ingest import bq, config
m = CostMeter()
m.add(config.MODEL_EXTRACT, 900_000, 150_000, operator="gca")
m.add(config.MODEL_VERIFY, 120_000, 20_000, operator="gca")
m.add(config.MODEL_EXTRACT, 300_000, 60_000, operator="bloom")
cov = bq.coverage()
bq.write_status("ac7-metered-demo", "refresh", {"documents": 12, "verified": 40, "quarantined": 1},
                cov, est_gbp=m.gbp(), tier_breakdown=m.breakdown(), by_operator=m.by_operator())
print("  wrote ledger: est_gbp=", m.gbp(), "by_operator=", m.by_operator())
PYEOF
AC7=$(BQ 'SELECT ARRAY_LENGTH(by_operator) bo, est_gbp FROM `govreposcrape.govbuy_raw.harness_run` WHERE run_id="ac7-metered-demo"' | tail -1)
echo "  harness_run(ac7-metered-demo): by_operator_len,est_gbp = $AC7"
[[ "${AC7%%,*}" -ge 1 ]] && echo "PASS AC-7 (ledger) — per-operator £ recorded ($AC7)" || { echo "FAIL AC-7 (ledger)"; fail=1; }

echo "--- AC-10: public is reprojectable from raw with no re-scrape (and CH matches survive) ---"
BEFORE=$(BQ 'SELECT COUNT(*) FROM `govreposcrape.govbuy_public.instrument`' | tail -1)
CH_BEFORE=$(BQ 'SELECT COUNTIF(company_number IS NOT NULL) FROM `govreposcrape.govbuy_public.supplier`' | tail -1)
PYTHONPATH="$ROOT/ingestion/src" "$PY" -m govbuy_ingest rebuild >/dev/null 2>&1   # merges CH back from supplier_match — no re-scrape, no CH API
AFTER=$(BQ 'SELECT COUNT(*) FROM `govreposcrape.govbuy_public.instrument`' | tail -1)
CH_AFTER=$(BQ 'SELECT COUNTIF(company_number IS NOT NULL) FROM `govreposcrape.govbuy_public.supplier`' | tail -1)
[[ "$BEFORE" == "$AFTER" && "$AFTER" -gt 0 ]] && echo "  reprojected $AFTER instruments from raw (was $BEFORE)" || { echo "FAIL AC-10 instruments ($BEFORE -> $AFTER)"; fail=1; }
[[ "$CH_AFTER" -ge "$CH_BEFORE" && "$CH_AFTER" -gt 0 ]] && echo "PASS AC-10 — rebuild preserved $CH_AFTER CH matches (was $CH_BEFORE), no re-scrape/no CH API" || { echo "FAIL AC-10 CH-preservation ($CH_BEFORE -> $CH_AFTER)"; fail=1; }

echo "--- AC-8 setup: inject a broken operator (failed/stale) into source_status ---"
bq query --project_id=govreposcrape --location=EU --use_legacy_sql=false \
  'INSERT INTO `govreposcrape.govbuy_public.source_status`(source_id,operator_id,last_run_at,last_success_at,last_run_status,facts_total,health,spend_coverage_note) VALUES("broken-operator-demo","broken-operator-demo",CURRENT_TIMESTAMP(),TIMESTAMP("2026-05-01T00:00:00Z"),"failed",0,"red","scrape failing >36h")' >/dev/null 2>&1

echo "--- AC-1..AC-9, AC-11 against the live MCP server ---"
node "$ROOT/api/test/ac_full.mjs" http://localhost:8080/mcp
MCP=$?

echo "--- cleanup demo rows ---"
bq query --project_id=govreposcrape --location=EU --use_legacy_sql=false \
  'DELETE FROM `govreposcrape.govbuy_public.source_status` WHERE source_id="broken-operator-demo"' >/dev/null 2>&1

echo "========================================================================"
[[ $fail -eq 0 && $MCP -eq 0 ]] && echo "RESULT: ALL ACCEPTANCE CRITERIA PASS (AC-1..AC-11)" || { echo "RESULT: FAILURES PRESENT"; exit 1; }

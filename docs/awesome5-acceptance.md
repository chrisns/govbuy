# "5 more awesome" — acceptance criteria

Five enhancements ideated 2026-06-12. Each ships to the live MCP and is verified by a `claude -p` / direct
tool call. All data stays inside `govbuy_public` (the API SA's read boundary); new materialisations are
re-runnable from `bq.py` (token-free).

## 1 — Live exclusion gate + s.62 debarment (AC-EX)
- **AC-EX-1** A `debarment_list` table exists in `govbuy_public` (`company_number, supplier_name, grounds,
  decision_date, review_date, source_url`), seeded from the published PA2023 debarment register; re-seedable
  from `reference-data/`.
- **AC-EX-2** `get_supplier`, `due_diligence`, `plan_buy`, `find_services` flag a supplier on the debarment
  list as a distinct **s.62 debarment ⚠** (separate from the Sch 6/7 insolvency flag), source-anchored.
- **AC-EX-3** `get_supplier` and `due_diligence` perform a **live Companies House status check** for the
  resolved CRN at query time (when the service holds the CH key), returning `live_status` + `checked_at` and
  using it for the exclusion decision; graceful fallback to the snapshot with a clear freshness label.
- **AC-EX-4** The exclusion payload names **both** PA2023 limbs (insolvency Sch 6/7 + debarment s.62) and
  marks snapshot-vs-live. Verified live.

## 2 — Mine the 658k awards to backfill membership + mechanics (AC-OBS)
- **AC-OBS-1** `observed_membership` materialised: `(instrument_id, rm_reference, supplier_crn) → award_count,
  total_gbp, last_award_date` from `tender_award` where `rm_reference` is present. Re-runnable in `bq.py`.
- **AC-OBS-2** `observed_mechanic` materialised: `rm_reference → channel mix` (framework_call_off / dps_call_off
  / direct / open counts + total). Re-runnable.
- **AC-OBS-3** `get_instrument` returns `observed_from_awards`: suppliers evidenced by real awards (CRN, count,
  £) + the observed mechanic mix, clearly labelled **inferred from award notices** (not official membership),
  giving a supplier/mechanic signal for frameworks whose official list/mechanic is absent.
- **AC-OBS-4** `get_supplier` returns `frameworks_evidenced_by_awards` (RM refs the supplier has won call-offs
  under). Verified: a framework with no official supplier list shows observed members; an instrument with no
  official mechanic shows an observed mechanic mix where awards exist.

## 3 — `compare_routes` decision matrix (AC-CMP)
- **AC-CMP-1** A new `compare_routes` tool: given a need (+ optional cpv/budget) returns 2–5 candidate routes,
  each scored on **speed** (direct-award available?), **competition_required**, **price evidence** (real award
  median where cpv given), **supplier_depth** (official appointed + observed-from-awards), **expiry_runway**
  (months to expiry), with a one-line rationale and an overall rank.
- **AC-CMP-2** Registered, source-anchored, named in server instructions; verified live returns a populated
  matrix (e.g. "cloud hosting").

## 4 — `contract_expiry_radar` (AC-RAD)
- **AC-RAD-1** A new `contract_expiry_radar` tool: given cpv/keyword and/or supplier (crn/name) + horizon
  (months, default 12), returns contracts ending in the window from `tender_award` — buyer, supplier (+CRN),
  value, end date, `official_url`, `months_to_end` — sorted by end date.
- **AC-RAD-2** Framed for both personas (buyer re-procurement deadline; seller displacement window); registered
  + in instructions. Verified live for a sector and a known incumbent CRN.

## 5 — Canonical identity at ingest + coverage/freshness transparency (AC-COV)
- **AC-COV-1** A `supplier_crn_canonical` map (`company_number → canonical supplier_id + member ids`) is
  materialised; `get_supplier` resolves one profile per CRN from it (no read-time guesswork) and the 5,181
  split-CRN cases collapse to a single canonical id.
- **AC-COV-2** `find_routes` / `get_instrument` carry a `coverage` struct: `has_official_supplier_list`,
  `has_award_mechanic`, `has_observed_awards`, `crn_matched` — completeness made explicit.
- **AC-COV-3** `get_status` reports per-table freshness (rows + last refresh) including the new tables.
  Verified live.

## Definition of done
- All ACs verified by direct tool / `claude -p` runs.
- README rewritten to feature these across the three personas; every claim source-anchored.
- `STATUS.md` updated; committed + pushed.

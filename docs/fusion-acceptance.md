# Fusion acceptance criteria — govbuy × UK Tenders ("route × reality")

**Goal:** fuse govbuy (route to market: 3,200 frameworks, 117,829 catalogue listings, 28k CRN-matched
suppliers, reseller graph, `compliant_path`) with the UK Tenders corpus (`cddo/find-tender-mcp`:
~681k processes, ~470k awards, 18.4k buyers, 154,552 Companies-House-tagged parties) into one MCP that
serves buyers, suppliers and researchers conclusively. Welded on **CRN + RM-reference + CPV + buyer**.

**Done when:** AC-DONE-1..3 below hold, verified by live `claude -p` runs and the AC suite.

## Foundations — data fusion & identity
- **AC-FUSE-1 (Inherit the corpus):** govbuy reads the full tender corpus, not just the call-off slice. *Verify:* `get_schema` lists tender process/award tables; `query_sql` joins `instrument`/`service` to tender awards in one statement.
- **AC-FUSE-2 (CRN reconciliation):** every govbuy supplier and tender party resolves to a shared `supplier_id` keyed on Companies House CRN. *Verify:* ≥90% of GB-COH tender parties share the govbuy `supplier_id`; 20 known suppliers join across both sides.
- **AC-FUSE-3 (Route↔reality keys):** awards link to frameworks (RM stem), capability (CPV↔lot/category), orgs (CRN+buyer). *Verify:* one `query_sql` returns, for RM1557, appointed suppliers + their real call-off awards + catalogue listings, joined.
- **AC-FUSE-4 (Track-record precision):** `find_services`' track record is CRN-joined and CPV/lot-scopable, not name-match. *Verify:* reconciles to the tenders MCP `top_suppliers` for the same supplier+framework; response states the scope.

## Buyer outcomes
- **AC-BUY-1 (Price reality):** `benchmark_price(need)` returns the real award distribution (median, IQR, n) by route. *Verify:* `claude -p` "what do councils pay to host a web app on G-Cloud?" returns a £ distribution from real awards with notice URLs.
- **AC-BUY-2 (Real due diligence):** `due_diligence(supplier)` by CRN: win record by CPV, customer concentration, competitive-vs-direct ratio, recent cancellations/amendments, CH status. *Verify:* answer distinguishes "wins competitively across N buyers" from "single-customer/direct-only", each with a source URL.
- **AC-BUY-3 (Listed ≠ delivers):** zero-award suppliers in `find_services` are flagged "listed, no recorded wins — verify references", never silently. *Verify:* the Alscient-style case is labelled in a `claude -p` run.

## Supplier outcomes
- **AC-SUP-1 (Pipeline in one call):** `supplier_pipeline(what_i_sell)` returns: live opportunities to bid, frameworks ranked by real call-off volume in that CPV, incumbents + contract end-dates, and resellers who could carry them. *Verify:* `claude -p` "I sell drone thermal imaging — what's live, which frameworks pay, who do I displace, when?" returns all four sections with live tender + framework URLs + CRNs.
- **AC-SUP-2 (Framework ROI):** frameworks ranked by realised call-off spend in the CPV; dead/low-conversion ones marked. *Verify:* ranking correlates with tender award volume; an appointed-but-£0 framework is labelled low-conversion.
- **AC-SUP-3 (Incumbent + expiry timing):** lists who holds the spend and when awards/frameworks expire (the displacement window). *Verify:* output cross-references award end-dates and `framework_months_to_expiry`.

## Researcher outcomes
- **AC-RES-1 (Flow map):** `spend_xray(cpv|buyer|region|time)` splits spend by channel — framework vs open tender vs direct award. *Verify:* the split sums to the attributable total and matches the tenders MCP aggregate.
- **AC-RES-2 (Competition health):** reports further-competition vs direct-award ratios and concentration (HHI / top-share) per CPV. *Verify:* `claude -p` "is competition healthy in cloud hosting?" returns concentration metrics with counts.
- **AC-RES-3 (Leakage):** sub-threshold / GPC / marketplace-consumption shadow spend reported separately (`is_route=FALSE`). *Verify:* reported as unattributable/leakage, never a compliant route.

## Integrity & guardrails
- **AC-GUARD-1 (No laundered matches):** every fused fact states its join basis + confidence; name-only matches flagged lower-confidence. *Verify:* responses carry a join-confidence indicator; a fuzzy name yields a hedged answer.
- **AC-GUARD-2 (Anti-fabrication preserved):** the verbatim gate + "not the authority of record / not legal advice" caveats survive. *Verify:* AC-6/AC-7-style evidence checks pass on fused tools; no fused claim without a source URL.
- **AC-GUARD-3 (Boundary preserved):** API SA reads only the curated least-privilege view, never raw tender PII. *Verify:* deploy read-boundary assertion passes; a raw-contact query via the API SA is denied.
- **AC-GUARD-4 (Two clocks):** every fused answer surfaces framework staleness AND tender recency. *Verify:* `get_status` reports both; a fused response shows tender last-update.
- **AC-GUARD-5 (No unfused cloning):** fused tools add joins; reuse the tenders MCP's search/aggregate, don't re-implement. *Verify:* code reads the tender dataset rather than duplicating ingestion.

## Definition of done
- **AC-DONE-1 (One brain, three personas):** three `claude -p` runs (buyer / supplier / researcher) each return a complete, source-anchored answer from a single MCP, no manual cross-server stitching.
- **AC-DONE-2 (Regression-free):** AC-1..AC-11 still pass; live ACs ≥ prior baseline.
- **AC-DONE-3 (Eval lift):** golden-eval pass-rate improves on 71%/0.75, with a persona-pipeline question added.

## Build order (highest ROI first)
1. **AC-FUSE-2** CRN reconciliation → upgrades AC-FUSE-4 track record for free.
2. **AC-SUP-1** `supplier_pipeline` — turns govbuy into a revenue tool for suppliers.
3. **AC-BUY-1** `benchmark_price`, then **AC-BUY-2** `due_diligence`, then **AC-RES-1** `spend_xray`.

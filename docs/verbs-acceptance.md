# Tool consolidation — 17 tools → 5 intent verbs

Collapse the MCP surface to five verbs that mirror how a person actually asks, so the model routes
cleanly and the depth sits behind fewer doors. Every prior capability is preserved; the leftover
duplicated SQL is deduped; nothing is left dead.

## Surface (AC-V)
- **AC-V1** The server exposes exactly **five** tools: `buy`, `sell`, `supplier`, `framework`, `research`.
  The 17 prior tools are gone from the tool list; no capability is lost.
- **AC-V2 — `buy({need, cpv?, budget?, depth?})`** (BUYER): an opinionated brief — recommended route +
  PA2023 mechanic, a ranked shortlist of real listings (CRN track record + two-limb exclusion), indicative
  price, forward pipeline, **alternative routes** (decision matrix), and a compliance checklist.
  `depth:"full"` adds the full candidate-route list + price distribution + more listings. Absorbs
  find_routes, find_services, compliant_path, plan_buy, compare_routes, benchmark_price.
- **AC-V3 — `sell({product, open_only?, cpv?, depth?})`** (SELLER): instruments/live DPS you can join,
  frameworks ranked by real call-off spend, live + forward opportunities, incumbents to displace (expiry
  windows), and resellers who can carry you in. Absorbs find_instruments_to_list, supplier_pipeline,
  list_resellers, contract_expiry_radar.
- **AC-V4 — `supplier({query, depth?})`** (BUYER/RESEARCHER): one profile by name or CRN — two-limb live
  exclusion (Companies House + s.62 debarment), canonical-reconciled framework footprint,
  award-evidenced frameworks, and the CRN-matched delivery record (call-off £, concentration,
  competitive-vs-direct mix, CPV footprint, contract-ends). Absorbs get_supplier, due_diligence.
- **AC-V5 — `framework({id?, rm_reference?, depth?})`**: one instrument — lots, lifecycle, appointed
  suppliers, observed-from-awards backfill, coverage, AND the PA2023-precise permitted award mechanics +
  statutory rules. Absorbs get_instrument, compliant_path.
- **AC-V6 — `research({sql?, cpv?, schema?, status?})`** (RESEARCHER): runs read-only BigQuery SQL (the
  escape hatch), or a spend x-ray for a CPV division, or returns the schema / freshness+status. Absorbs
  query_sql, spend_xray, get_schema, get_status.
- **AC-V7 — depth knob.** `buy`/`sell`/`supplier`/`framework` take `depth ∈ {brief, full}` (default
  `brief`) controlling payload breadth, so the fat verbs stay cheap by default.

## Quality (AC-Q)
- **AC-Q1 — no regression.** Every prior capability is reachable; the golden eval re-runs with TOOLS = the
  five verbs at **≥ the pre-refactor pass rate**; the hardest demos still answer correctly through the new
  verbs: drone DPS (further-competition only), Minute hosting (+ data residency), liquidation exclusion
  STOP, the IT framework-vs-open premium, the managed-SOC route comparison, Appvia's full footprint.
- **AC-Q2 — no redundant code.** The 17 handlers become composed capability functions: **no dead code**,
  and the SQL duplicated across the old separate tools (find_services vs plan_buy shortlist; find_routes vs
  compare_routes) is deduped to one source each. `tsc` clean; nothing unused.
- **AC-Q3 — steering.** Server `instructions` rewritten for the five verbs; each description names the
  persona, the capabilities it absorbs, and what to chain.

## Definition of done (AC-DONE)
- README, the website (tools section + "17 tools" copy + example-question tool names), `STATUS.md`, and the
  acceptance docs updated to the five verbs. Deployed to the live MCP; each verb verified with a real
  `claude -p`; pushed. The site still says only true things.

# Spend coverage — how govbuy reaches ≥80% (PRD §15 / AC-9)

> Run 2026-06-06 against `govreposcrape.govbuy_public.sibling_call_off_awards` (the materialised,
> non-PII snapshot of the sibling's call-off awards). Achieved **86.8%**.

## The metric (and why this denominator)

`get_status` / `harness_run` report:

- **`attributable_gbp_bn` = £321.3bn** — GBP award value of call-offs that **carry an RM reference**
  (i.e. name the framework they were let under). This is the spend that *can* be attributed to a
  named instrument, and therefore the only spend govbuy can meaningfully claim to "cover". **This is
  the denominator.**
- **`covered_gbp_bn`** — attributable spend whose framework govbuy has indexed (instrument with a
  matching RM stem). **£278.9bn.**
- **`spend_coverage_pct` = covered / attributable = 86.8%.**
- **`unattributable_flagged_gbp_bn` = £222.4bn** — call-offs flagged `procurementMethodDetails =
  'Call-off from a framework agreement'` but carrying **no** RM reference. The source says "a
  framework" but names none, so it is unkeyable to a specific instrument **by anyone** — reported
  **separately**, never charged against coverage.

Why not denominator = RM ∪ flag (£543.6bn)? Because the flagged-no-RM £222.4bn has no join key, so
RM-stem matching tops out at £321.3bn/£543.6bn = 59% — 80% of the union is mathematically
unreachable. Charging unkeyable spend against govbuy would measure source data quality, not govbuy's
coverage. Attributable-spend coverage is the honest, correct metric.

**Caveat (inherited):** award values are framework/contract **ceilings**, not actual spend; some
notices carry placeholder maxima. The coverage % is of *awarded ceiling value*, consistent with how
the sibling reports value.

## How it was achieved — Pareto, not brute force

Framework spend is sharply concentrated. Ranking RM stems by GBP and taking the cumulative head:

| Rank | reaches | of attributable |
|---|---|---|
| 5 (RM6011, RM6378, RM6088, RM6267, RM3749) | £170bn | 52.8% |
| 10 | | 70.3% |
| **17** | | **80.0%** |
| 25 (indexed) | £278.9bn | **86.8%** |

The top frameworks by spend (energy, facilities management, construction, public-sector resourcing,
vehicles) — **not** the tech/AI cluster — carry the bulk of the money. The agentic harness
**discovered each one's real identity** (name, operator, type, regime, lifecycle, category) from its
GCA/CCS agreement page, source-anchored with a verbatim excerpt (all 25 passed the gate, 0
quarantined). Many are expired/closed historical frameworks (e.g. RM3749 Public Sector Resourcing,
RM6060 Vehicle Purchase) — correctly modelled with their lifecycle, so they count toward historical
spend coverage but are not offered as live buying routes by `find_routes`.

## Reproduce

1. Rank RM stems by GBP (the query in this file's git history / `bq`), pick the head to your target %.
2. Run the enrichment harness recipe `scripts/workflows/topspend-framework-enrichment.js` (one agent
   per batch of RM numbers → source-anchored instrument facts).
3. `govbuy-ingest load-bundle <bundle> --match` → gate + project + re-match + recompute.
4. `govbuy-ingest coverage` → confirm `spend_coverage_pct`.

Coverage grows monotonically as more frameworks are indexed; this is the runtime/breadth dimension
the harness extends over time.

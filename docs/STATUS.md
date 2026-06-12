# govbuy — status & gaps

_UK public-sector route-to-market MCP. Sibling of find-tender-mcp; same `govreposcrape` GCP project,
distinct hostname `govbuy.run.cns.me/mcp` and codebase._

## Where we are

| | |
|---|---|
| Operators (with ≥1 framework) | **147** (185 rows incl. catalogue-blocked) |
| Frameworks / DPS / dynamic markets | **3,207** (3,108 live for call-off) |
| Suppliers | **28,247** — **28,031 CRN-matched (99.2%)** via Companies House |
| Appointed-supplier edges | **57,055** |
| Frameworks with a supplier list | **2,455 (77%)** |
| Frameworks with how-to-call-off mechanics | **2,289 (71%)** |
| Spend coverage (RM-attributable) | **91.4%** |
| Acceptance | **11/11 (AC-1..11)** |

**Coverage spans every route a UK public buyer would use:** CCS/GCA + G-Cloud (deterministic, via
API + Digital Marketplace); all HE purchasing consortia; local-gov POs; NHS national + regional +
pharma hubs; BlueLight Commercial + police/fire; Defence Digital; devolved nations (Scotland/Wales/
NI CPD); combined authorities; the full housing / construction / highways / education consortia
layers; and a deep tail of council- and trust-led frameworks.

**How it's built (hybrid):** deterministic where an API exists (GCA frameworks + suppliers, G-Cloud
directory); agentic everywhere else (fetch → extract → **verbatim-substring gate** → load). The gate
is the anti-fabrication anchor: a supplier/framework name not present in the archived source is
quarantined, never published. Companies House matching is incremental + crash/429-resilient.
Extraction workflows run on **Haiku** (gate-protected, cheap); re-discovery on Sonnet.

## What's missing (and why)

### Supplier lists — 752 of 3,207 frameworks still have none, by reason ([details](access-barriers.md))
- **Login-walled — 328 frameworks. Needs credentials (actionable).** Highest-value single credential
  is **`hunterpcm.uk`** (Hunter CSM portal) → ~98 HE-consortia frameworks (NEUPC 72, APUC 21, LUPC 5).
  Then Pagabo (23), YPO (15), NHS LPP (13), TPPL (11), advantageswtenders.co.uk (10), CHIC (9).
- **No public list — 950.** Page loads but genuinely names no suppliers (managing-agent/DPS models
  that don't publish membership, e.g. 2buy2, Bloom-style pools). Not retrievable from the public web.
- **Blocked — 137.** JS-only/anti-bot pages (some transient and recovered on re-sweep; some are
  in-tend/carepulse portals that are effectively login-walled).
- **Dead link — 29.** Stale official_url.

### Award mechanics — 918 frameworks have no call-off route
The page and any linked user-guide PDF don't state direct-award vs further-competition. Inferring a
route would be fabrication (the gate forbids it). PDF user guides were the big unlock (44% → 71%).

### Five more — awesome enhancements (DELIVERED)
Five further enhancements (ACs in [awesome5-acceptance.md](awesome5-acceptance.md)), all live + verified:
- **Two-limb, live exclusion gate.** `get_supplier`/`due_diligence` now check BOTH PA2023 exclusion limbs:
  insolvency (Sch 6/7) via a **live Companies House status lookup at query time** (`exclusion.insolvency.source
  = live_companies_house`, CH key wired to Cloud Run) and the **s.62 debarment register** (published by gov.uk;
  currently blank, so the gate states *not debarred* with a source — and any future entry flows through
  token-free via `reference-data/debarment_list.jsonl`). Debarment flag also on `find_services`/`plan_buy`.
  Verified: Softcat → live status `active`, debarment checked.
- **Award-mining backfill.** `observed_membership` (3,910 supplier×framework edges) + `observed_mechanic` (428
  RMs) mined from the 658k awards. `get_instrument.observed_from_awards` backfills who's *really* won call-offs
  on a framework + the observed direct-vs-competed mix where the official list/mechanic is missing (verified:
  RM6200, no official list, now shows 4 observed suppliers + mechanic mix); `get_supplier.frameworks_evidenced_by_awards`
  shows the RMs a firm has actually transacted on. Labelled inferred-not-official.
- **`compare_routes`** — a head-to-head decision matrix: speed (direct vs further competition) × supplier depth
  (official + observed) × expiry runway × real median £, with a per-route rationale. Verified: "cloud hosting" → 6 ranked routes.
- **`contract_expiry_radar`** — real contracts ending within a horizon by cpv/keyword/supplier; buyer = re-procurement
  deadlines, seller = displacement windows. Verified: CPV-72 → 20 expiring contracts.
- **Canonical CRN + coverage/freshness.** `supplier_crn_canonical` collapses the 5,181 split identities at the
  data layer (`get_supplier` resolves membership from it); `coverage` struct on `find_routes`/`get_instrument`
  makes record-completeness explicit; `get_status` reports per-table freshness (fused awards, observed edges,
  reconciled identities, debarment entries). All materialisations re-runnable token-free via `bq.materialize_observed()`.

### Decisive & bulletproof — the top-5 voter-tournament winners (DELIVERED)
The five features the voter panel picked (see [top5-acceptance.md](top5-acceptance.md)), all live + verified:
- **PA2023 regime engine** — `compliant_path` is now statutorily precise (15 sourced rules in `pa2023_rule`):
  competitive flexible procedure, the 8-working-day standstill, Schedule 5 direct-award grounds, open/closed
  frameworks, the DPS→dynamic-market sunset (Feb 2029), the >£5m KPI duty, payment-method-blind, and that a
  framework call-off is NOT a statutory direct award. (Verified: the eval's hardest PA2023 question now nails it.)
- **Exclusion gate** — `get_supplier`/`due_diligence`/`find_services`/`plan_buy` flag dissolved / liquidation /
  administration suppliers (1,790 of them) as a PA2023 Sch 6/7 ⚠, never silently. (Verified: stopped an award to a
  supplier in liquidation.)
- **`plan_buy`** — one opinionated brief: route + mechanic + shortlist (track record + exclusion) + indicative
  price + forward pipeline + compliance checklist.
- **Steering descriptions** — all 15 tool descriptions rewritten (persona, next-tool, anti-patterns, "a desk"
  disambiguation, NULL = absence-of-evidence).
- **Forward pipeline** — `pipeline_notice` (29,306 planned notices) + `supplier_pipeline`'s coming-soon section.

**Eval honesty (throttled 4-wide re-run, 27 Qs):** raw **70% / 0.71** — and decomposed honestly, the 8 failures
are *not* 8 feature gaps:
- **2 are harness false-negatives.** The run-agent backgrounded its nested `claude -p` and returned a *"Monitor
  active, waiting for the command…"* status string instead of the answer. Re-run **solo**, both pass cleanly and
  richly: the IT-service-desk answer returns the full route landscape (G-Cloud 14 / TS4 / Back Office Software 2 +
  real `applytosupply…/g-cloud/services/…` URLs + PA2023 duties); the G-Cloud-14-Lot-2 answer returns the
  appointed-supplier list + 2025 call-off £ + the lot-membership caveat. **Harness-corrected ≈ 78% (21/27).** The
  harness now forbids the run-agent from backgrounding `claude -p` (the artifact's cause), so the next automated run
  reports the corrected figure directly.
- **1 surfaced a real bug — now FIXED.** Supplier identity is split across ingestion sources: Appvia is two rows
  — `appvia-ltd` (GCA spine → TS4/RM6190) and `dm-708440` (Digital Marketplace → G-Cloud 14), same CRN, never
  merged — so `get_supplier` under-reported the framework footprint (**5,181 Companies House numbers map to >1
  `supplier_id`**). `get_supplier` now resolves the best-matched record then UNIONs appointments/channels/scope
  across every `supplier_id` sharing that `company_number`, with a `reconciliation` note. Verified live:
  `get_supplier(Appvia)` and the end-to-end eval question now return **both** RM1557.14 and RM6190.
  (`due_diligence`/`find_services`/`plan_buy` already joined track record on CRN, so they were never affected.)
  The most valuable thing the eval caught — and shipped.
- **2 more were surfacing bugs — now FIXED.** The "missing" instruments (YPO Drones DPS 1148, RM6200 AI DPS,
  HealthTrust AI DPS) were all **present in the data** but unreachable through three real defects in the search tools:
  1. **Dead word-boundary regex.** `find_routes` / `find_instruments_to_list` built their name/lot regex as
     `r'\b'` inside a JS *template literal*, where `\b` is the backspace escape (0x08) — so the regex matched a
     literal backspace and **never fired**. Name & lot matching was effectively dead; only `category_tags` matched.
     Fixed to `r'\\b'` (a real word boundary). `find_services`/`plan_buy` were already correct.
  2. **No plural handling.** `\bdrone\b` doesn't match "Drone**s**". Now every search tool matches a plural suffix
     on the haystack (`(?:es|s)?`) and conservatively singularises query tokens (drones→drone, gases→gas, leaving
     gas/bus/status/analysis alone) — so a query matches names in either direction.
  3. **Live DPS hidden from sellers.** `find_instruments_to_list?openOnly=true` allowed only `open_framework` /
     `dynamic_market`, excluding the 210 `legacy_dps` — but a DPS is *by definition* continuously joinable while
     live. Now live legacy DPS count as `joinable_now`, so the AI/Drones DPS reach sellers asking "what can I join?".
  4. **Row-multiplying evidence join.** A top-level `LEFT JOIN claim_evidence` fanned each instrument out by its
     evidence-row count (385 instruments, often 5-6×: the AI DPS appeared 6 times); the `MECHANICS` array did the
     same (2,665 mechanics). Replaced with a join to a pre-grouped, highest-confidence evidence derived table
     (de-correlatable — a naïve correlated `ORDER BY…LIMIT 1` errors at runtime on BigQuery).
  Plus a relevance fix: `find_routes`/`find_instruments_to_list` ranked purely alphabetically, burying a specific
  match under generic ones; they now rank by a name>tag>lot match score. Verified live: a `drone`/`drones` query
  returns the Drones DPS 1148 top (deduped); `openOnly` surfaces RM6200 as joinable; `get_instrument` returns
  single, non-duplicated mechanics + evidence.
- **3 residual items — addressed.** The **s49 open-framework** complaint was a *judge* error, not ours — a PA2023
  open framework admits suppliers at defined re-opening points (s.49); continuous joining is a *dynamic market*. The
  answer was right; nothing to fix. The other two were answer-quality and are now steered:
  - **Fabrication.** A hard GROUNDING rule now rides in `NOT_ADVICE` (carried in every tool response) and the server
    `instructions`: every £ figure, RM reference, supplier name and URL MUST come verbatim from a tool result — if
    govbuy doesn't hold it, say so. Verified: the lab-gases answer no longer invents a "£14.4m/33 call-offs" figure
    or a CPC URL — it cites real award ranges and *asks* which consortium framework the buyer is on.
  - **Data residency.** A structured `data_residency_note` field is now emitted by `find_services`/`plan_buy` (and
    a checklist line in `plan_buy`) whenever the need is data-sensitive (AI/ML, transcription, hosting, personal/
    sensitive records), plus a DATA-RESIDENCY clause in the server `instructions`. Verified live: the Minute need
    returns the note prompting confirmation of UK/EEA processing + UK-GDPR. (Structured field, not just prose, so
    the model reliably surfaces it.)

### Fused with UK Tenders — route × reality, for buyers + suppliers + researchers
govbuy is welded to the UK Tenders corpus (681k processes / 470k awards) on **Companies House CRN +
RM-reference + CPV**, all materialised into `govbuy_public` (boundary preserved — the API SA never
touches raw tender PII). See [fusion-acceptance.md](fusion-acceptance.md). New persona tools, each
CRN-joined and source-anchored:
- **supplier_pipeline** (seller) — live opportunities + frameworks ranked by REAL call-off spend +
  incumbents with contract-end displacement windows + carry-in resellers.
- **benchmark_price** (buyer) — the real £ distribution paid (median/p25/p75) overall + by channel.
- **due_diligence** (buyer) — a supplier's CRN-matched delivery record: call-off £, customer
  concentration, competitive-vs-direct mix, CPV footprint, contract-end dates.
- **spend_xray** (researcher) — how money flows (framework vs open vs direct) + market concentration.
- **find_services** proof-of-delivery is now CRN-precise (joins `supplier_calloff_total`, not name).

Verified AC-DONE-1 with three live `claude -p` runs (buyer/supplier/researcher) answering conclusively
from one MCP. Fused tables refresh via `bq.materialize_fusion()`.

### Capability search is now decision-grade (spend + price + expiry + semantic + compliant path)
`find_services` no longer just lists who *can* do a thing — it shows whether they actually *do*:
- **Proof of delivery**: joins `supplier_track_record` (materialised from 557k call-off awards) so each
  listing shows its supplier's real £ won on that framework — e.g. "managed kubernetes" → Computacenter
  £6.46m/7 call-offs.
- **Price + expiry**: indicative `price_gbp` (where the catalogue publishes it) and
  `framework_months_to_expiry` (act-before date).
- **Semantic search**: every description is embedded (Vertex `text-embedding-005` via a BigQuery remote
  model + `VECTOR_SEARCH`, brute-force for full recall over 117k); blended with keyword scoring so
  "automatically transcribe and summarise meetings" surfaces transcription/AI services — incl. i.AI's
  own **Minute** on NDX — that share no keyword with the query. (`semantic_similarity` per row.)
- **`compliant_path` tool**: instrument/RM → permitted award mechanics + conditions + buying docs +
  the "a card/marketplace is NOT a route" payment caveats — the actual next steps.
- **Reseller graph**: expanded 1 → 17 (thin-prime/VAR/hybrid) + 64 vendor `inbound_scope` links, via a
  parallel thin-prime extraction workflow, all source-anchored.
- **Eval harness** (`eval/golden_questions.json` + `scripts/workflows/eval-harness.js`): golden
  buyer/seller questions → live MCP → parallel LLM-judges. **27 questions (incl. 3 fused-persona).** The
  pre-PA2023 baseline cleared 74% with failures clustering on Procurement-Act-2023 statutory nuance; that
  regime is now encoded (`pa2023_rule`, see below). The post-delivery throttled re-run and its honest
  decomposition (harness artifacts vs the real supplier-identity bug vs genuine content gaps) are written
  up under **Eval honesty** above.

### Capability search — service-level descriptions (DONE across all UK buying catalogues)
govbuy indexes **65,442 per-listing descriptions** across every public UK public-sector buying
catalogue, so "find who can host open-source LLM apps / supply a desk / run a service desk" resolves
to concrete, citable listings via `find_services` (filterable by `catalogue`). All crawlers are
deterministic + re-runnable **token-free** (no LLM in the loop), each row carries its source URL:
- **G-Cloud 14 — 43,733** services (Digital Marketplace search), 99.9% CRN-resolved.
- **Azure Marketplace — 38,928** offers (SSR gallery → catalog API; capability-search only, never a route).
- **YPO — 23,459** products (Sitecore Discover API, sharded by `product_taxonomy` to beat the 10k cap).
- **ESPO — 11,621** products (Klevu search API).
- **NHS Buying Catalogue — 48** clinical-IT solutions; **NDX — 40** digital-exchange products.

- **Azure Marketplace** (SSR gallery bigId enumeration → public catalog API enrichment). Ingested as
  a capability-searchable catalogue tagged `catalogue="azure"` ONLY — it is **never** treated as a
  route (govbuy's model classifies hyperscaler marketplaces as `marketplace_consumption`, not a
  route; `find_routes`/`instrument` are untouched). It just makes "what's on Azure Marketplace that
  does X" searchable alongside the UK catalogues.

**AWS / GCP marketplaces** remain out — no open token-free enumeration (AWS gallery is client-rendered
behind bot protection; GCP is console-auth-walled). Optional quality follow-up: features/benefits
enrichment of G-Cloud descriptions from the detail pages.

### Structural / upstream limits
- **GCA DPS & dynamic markets (27 live):** rolling membership not exposed by the GCA suppliers API.
- **No-public-catalogue bodies:** DE&S/DIO/AWE (defence), NHS commissioning support units, individual
  police forces, National Highways, Network Rail, NI departments, crown dependencies. They advertise
  per-tender on **Find-a-Tender** — that's the sibling find-tender-mcp's job, not framework-indexable.
- **Intelligence / classified procurement:** no public catalogue — genuinely unindexable.
- **Lot-level supplier membership:** captured at framework level; per-lot membership is partial.
- **Operator long tail:** breadth converged (genuinely-new/round 45→36→20→8→~5; re-discovery now
  returns Pagabo host-shells/dups). More minor single-framework council bodies always exist, but each
  is increasingly marginal.

## Next steps
1. **Credentials** for the login-walled portals (start with hunterpcm.uk) → unlocks ~98 + the rest.
2. Optional: headless-browser pass for the genuinely-JS `blocked` subset.
3. Nightly: `govbuy-ingest refresh` (deterministic GCA+G-Cloud spine) + the saved agentic workflows;
   no scheduler in infra — operator-hosted, cost-metered, with a liveness alert.
4. _(Optional, deeper)_ The query-time CRN reconciliation in `get_supplier` could be pushed into ingest
   (one canonical `supplier_id` per `company_number`), which would also de-duplicate the 5,181 split CRNs
   everywhere at once — but the read-time union already gives correct answers today.

_Generated after the breadth/depth sweeps; figures from `govbuy_public`. Not the authority of record._

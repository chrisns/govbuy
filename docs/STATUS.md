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
- **Eval harness** (`eval/golden_questions.json` + `scripts/workflows/eval-harness.js`): 24 golden
  buyer/seller questions → live MCP → parallel LLM-judges. **Baseline: 71% pass, 0.75 avg** — failures
  cluster on Procurement-Act-2023 regime nuance (standstill, payment-blind, DPS sunset) — the next gap.

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

_Generated after the breadth/depth sweeps; figures from `govbuy_public`. Not the authority of record._
